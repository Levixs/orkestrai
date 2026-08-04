import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Voz EMBARCADA (sem Docker, sem Python): STT Parakeet-TDT v3 e TTS Kokoro
 * multi-lang (pt-BR) rodando in-process via sherpa-onnx (binario nativo npm).
 * Os modelos sao baixados UMA vez do GitHub/HF para o diretorio de dados do app
 * e ficam em cache — o padrao do app. O sidecar Docker vira opcao avancada.
 */

const PARAKEET = {
  id: 'parakeet-tdt-v3-int8',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2',
  dir: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
  sizeMb: 487,
};

const KOKORO = {
  id: 'kokoro-multi-lang-v1_0',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2',
  dir: 'kokoro-multi-lang-v1_0',
  sizeMb: 250,
};

/** Vozes pt-BR do Kokoro multi-lang v1.0 (ordem do voices.bin, 53 speakers). */
export const KOKORO_PT_VOICES: Record<string, number> = {
  pf_dora: 41,
  pm_alex: 42,
  pm_santa: 43,
};

type ModelDef = typeof PARAKEET;

/** Diretorio de modelos (userData no empacotado; storage/voice em dev). */
export function voiceModelsDir(): string {
  const base = process.env.ORKESTRAI_DATA_DIR ?? join(process.cwd(), 'storage');
  const dir = join(base, 'voice', 'models');
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function downloadFile(url: string, dest: string, onProgress?: (percent: number) => void): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Falha ao baixar ${url} (HTTP ${response.status}).`);
  const total = Number(response.headers.get('content-length') ?? 0);
  const tmp = `${dest}.part`;
  const out = createWriteStream(tmp);
  let received = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (total > 0) onProgress?.(Math.round((received / total) * 100));
      if (!out.write(value)) {
        await new Promise<void>((resolvePromise) => out.once('drain', resolvePromise));
      }
    }
  } finally {
    await new Promise<void>((resolvePromise) => out.end(resolvePromise));
  }
  renameSync(tmp, dest);
}

async function ensureModel(def: ModelDef, onProgress?: (percent: number) => void): Promise<string> {
  const root = voiceModelsDir();
  const target = join(root, def.dir);
  const marker = join(target, '.complete');
  if (existsSync(marker)) return target;

  const archive = join(root, `${def.id}.tar.bz2`);
  if (!existsSync(archive)) {
    onProgress?.(0);
    await downloadFile(def.url, archive, onProgress);
  }
  // Extrai com o tar do sistema (bsdtar no mac, GNU no linux, tar.exe no Win10+).
  mkdirSync(target, { recursive: true });
  try {
    execFileSync('tar', ['xjf', archive, '-C', root], { timeout: 300_000 });
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw new Error(`Falha ao extrair ${def.id}: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
  }
  if (!existsSync(target)) throw new Error(`Extracao de ${def.id} nao produziu ${def.dir}.`);
  writeFileSync(marker, new Date().toISOString());
  rmSync(archive, { force: true });
  return target;
}

// -- Download orquestrado (compartilhado entre STT/TTS e o endpoint de status) --

type DownloadState = {
  downloading: boolean;
  /** 0-100 (media ponderada dos dois modelos). */
  percent: number;
  error: string | null;
};

let downloadState: DownloadState = { downloading: false, percent: 0, error: null };
let downloadPromise: Promise<void> | null = null;

/** Baixa os dois modelos (uma vez); chamadas concorrentes compartilham a promise. */
export function ensureEmbeddedModels(): Promise<void> {
  if (embeddedModelsReady()) return Promise.resolve();
  if (downloadPromise) return downloadPromise;
  downloadState = { downloading: true, percent: 0, error: null };
  downloadPromise = (async () => {
    try {
      const totalMb = PARAKEET.sizeMb + KOKORO.sizeMb;
      await ensureModel(PARAKEET, (percent) => {
        downloadState.percent = Math.round((percent * PARAKEET.sizeMb) / totalMb);
      });
      await ensureModel(KOKORO, (percent) => {
        downloadState.percent = Math.round((PARAKEET.sizeMb + percent * KOKORO.sizeMb) / totalMb);
      });
      downloadState = { downloading: false, percent: 100, error: null };
    } catch (error) {
      downloadState = {
        downloading: false,
        percent: 0,
        error: error instanceof Error ? error.message.split('\n')[0] : 'Falha no download.',
      };
      downloadPromise = null; // permite tentar de novo
      throw error;
    }
  })();
  return downloadPromise;
}

/** Estado do download para a UI (polling). */
export function embeddedDownloadStatus(): DownloadState & { ready: boolean } {
  return { ready: embeddedModelsReady(), ...downloadState };
}

// -- Singletons (carrega o modelo uma vez por processo) ------------------------

type Recognizer = {
  createStream(): { acceptWaveform(wave: { samples: Float32Array; sampleRate: number }): void };
  decode(stream: unknown): void;
  getResult(stream: unknown): { text: string };
};

type Tts = {
  sampleRate: number;
  generate(input: { text: string; sid: number; speed: number }): { samples: Float32Array };
};

let recognizerPromise: Promise<Recognizer> | null = null;
let ttsPromise: Promise<Tts> | null = null;

async function loadSherpa() {
  const mod = await import('sherpa-onnx-node');
  return (mod as { default?: unknown }).default ?? mod;
}

async function getRecognizer(): Promise<Recognizer> {
  if (!recognizerPromise) {
    recognizerPromise = (async () => {
      await ensureEmbeddedModels();
      const dir = join(voiceModelsDir(), PARAKEET.dir);
      const sherpa = (await loadSherpa()) as { OfflineRecognizer: new (config: unknown) => Recognizer };
      return new sherpa.OfflineRecognizer({
        modelConfig: {
          transducer: {
            encoder: join(dir, 'encoder.int8.onnx'),
            decoder: join(dir, 'decoder.int8.onnx'),
            joiner: join(dir, 'joiner.int8.onnx'),
          },
          tokens: join(dir, 'tokens.txt'),
          numThreads: 2,
          provider: 'cpu',
          debug: 0,
        },
      });
    })();
    recognizerPromise.catch(() => {
      recognizerPromise = null;
    });
  }
  return recognizerPromise;
}

async function getTts(): Promise<Tts> {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      await ensureEmbeddedModels();
      const dir = join(voiceModelsDir(), KOKORO.dir);
      const sherpa = (await loadSherpa()) as { OfflineTts: new (config: unknown) => Tts };
      return new sherpa.OfflineTts({
        model: {
          kokoro: {
            model: join(dir, 'model.onnx'),
            voices: join(dir, 'voices.bin'),
            tokens: join(dir, 'tokens.txt'),
            dataDir: join(dir, 'espeak-ng-data'),
            lang: 'pt',
          },
          numThreads: 2,
          provider: 'cpu',
          debug: 0,
        },
      });
    })();
    ttsPromise.catch(() => {
      ttsPromise = null;
    });
  }
  return ttsPromise;
}

/** WAV PCM16 mono -> Float32Array (+resample linear se nao for 16 kHz). */
export function wavToPcm16(wav: Buffer): { samples: Float32Array; sampleRate: number } {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Audio nao e WAV PCM (o app envia WAV 16 kHz).');
  }
  const channels = wav.readUInt16LE(22);
  const rate = wav.readUInt32LE(24);
  const bits = wav.readUInt16LE(34);
  if (bits !== 16) throw new Error(`WAV de ${bits} bits nao suportado (use PCM 16).`);
  const dataOffset = wav.indexOf('data', 0, 'ascii') + 8;
  const frames = Math.floor((wav.length - dataOffset) / (bits / 8) / channels);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    samples[i] = wav.readInt16LE(dataOffset + i * 2 * channels) / 32768;
  }
  if (rate === 16_000) return { samples, sampleRate: 16_000 };
  const ratio = rate / 16_000;
  const out = new Float32Array(Math.floor(frames / ratio));
  for (let i = 0; i < out.length; i += 1) out[i] = samples[Math.floor(i * ratio)];
  return { samples: out, sampleRate: 16_000 };
}

/** Float32Array -> WAV PCM16 mono. */
export function pcmToWav(samples: Float32Array, sampleRate: number): Buffer {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVEfmt ', 8, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  }
  return buffer;
}

/** Transcreve PCM16 mono 16 kHz para texto (Parakeet-TDT v3, CPU). */
export async function transcribePcm(samples: Float32Array): Promise<string> {
  const recognizer = await getRecognizer();
  const stream = recognizer.createStream();
  stream.acceptWaveform({ samples, sampleRate: 16_000 });
  recognizer.decode(stream);
  return recognizer.getResult(stream).text.trim();
}

/** Sintetiza texto em amostras Float32 com uma voz pt-BR do Kokoro. */
export async function speakPcm(
  text: string,
  voice = 'pf_dora'
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const tts = await getTts();
  const sid = KOKORO_PT_VOICES[voice] ?? KOKORO_PT_VOICES.pf_dora;
  const audio = tts.generate({ text: text.slice(0, 2_000), sid, speed: 1.0 });
  return { samples: audio.samples, sampleRate: tts.sampleRate };
}

/** Modelos presentes no cache (para o app saber se precisa confirmar download). */
export function embeddedModelsReady(): boolean {
  const root = voiceModelsDir();
  return existsSync(join(root, PARAKEET.dir, '.complete')) && existsSync(join(root, KOKORO.dir, '.complete'));
}

/** Tamanho atual dos modelos em disco (bytes; 0 se nao baixados). */
export function embeddedModelsSize(): number {
  const models = voiceModelsDir();
  if (!existsSync(models)) return 0;
  let total = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else total += statSync(full).size;
    }
  };
  try {
    walk(models);
  } catch {
    // sumiu no meio da varredura
  }
  return total;
}

/** Apaga os modelos e reseta os singletons — proximo uso baixa de novo. */
export function deleteEmbeddedModels(): void {
  recognizerPromise = null;
  ttsPromise = null;
  downloadPromise = null;
  downloadState = { downloading: false, percent: 0, error: null };
  rmSync(voiceModelsDir(), { recursive: true, force: true });
}

export const EMBEDDED_MODELS_SIZE_MB = PARAKEET.sizeMb + KOKORO.sizeMb;
