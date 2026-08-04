import { execFileSync, fork, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs';
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

/**
 * Runtime Node standalone (~50 MB) baixado junto com os modelos: o V8 sandbox
 * do Electron proibe os buffers externos que o TTS usa, entao a inferencia
 * roda num subprocesso sob um Node real — sem depender do usuario ter Node.
 */
const VOICE_NODE = { sizeMb: 50 };

/** Runtime Node por plataforma (null = sem pacote; cai no Node do sistema). */
export function voiceNodeArchive(platform: string, arch: string): { url: string; dir: string; bin: string } | null {
  const version = 'v24.12.0';
  const files: Record<string, string> = {
    'darwin-arm64': `node-${version}-darwin-arm64.tar.gz`,
    'darwin-x64': `node-${version}-darwin-x64.tar.gz`,
    'linux-x64': `node-${version}-linux-x64.tar.xz`,
    'linux-arm64': `node-${version}-linux-arm64.tar.xz`,
    'win32-x64': `node-${version}-win-x64.zip`,
  };
  const file = files[`${platform}-${arch}`];
  if (!file) return null;
  const dir = file.replace(/\.(tar\.gz|tar\.xz|zip)$/, '');
  const bin = platform === 'win32' ? `${dir}/node.exe` : `${dir}/bin/node`;
  return { url: `https://nodejs.org/dist/${version}/${file}`, dir, bin };
}

/** Node embarcado ja extraido (null se ainda nao baixado). */
function bundledVoiceNode(): string | null {
  const def = voiceNodeArchive(process.platform, process.arch);
  if (!def) return null;
  const bin = join(voiceModelsDir(), 'runtime', def.bin);
  return existsSync(bin) ? bin : null;
}

/** Vozes pt-BR do Kokoro multi-lang v1.0 (ordem oficial do voices.bin, 53 speakers, sid 0-52). */
export const KOKORO_PT_VOICES: Record<string, number> = {
  pf_dora: 42,
  pm_alex: 43,
  pm_santa: 44,
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

/** Baixa e extrai o runtime Node standalone (best-effort: falha cai no Node do sistema). */
async function ensureVoiceNode(onProgress?: (percent: number) => void): Promise<void> {
  if (bundledVoiceNode()) return;
  const def = voiceNodeArchive(process.platform, process.arch);
  if (!def) return;
  const root = join(voiceModelsDir(), 'runtime');
  mkdirSync(root, { recursive: true });
  const archive = join(root, 'node-runtime.download');
  onProgress?.(0);
  await downloadFile(def.url, archive, onProgress);
  try {
    // bsdtar/GNU tar auto-detectam gz/xz/zip ao extrair.
    execFileSync('tar', ['xf', archive, '-C', root], { timeout: 120_000 });
  } finally {
    rmSync(archive, { force: true });
  }
  if (!bundledVoiceNode()) throw new Error(`Extracao do runtime nao produziu ${def.bin}.`);
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

/** Pico de disco durante download+extracao (arquivo compactado + conteudo extraido). */
export const VOICE_REQUIRED_BYTES = 2 * 1024 ** 3; // ~2 GB

/** Espaco livre no volume dos modelos + o minimo exigido para baixar. */
export function voiceDiskSpace(): { freeBytes: number; requiredBytes: number } {
  try {
    const stats = statfsSync(voiceModelsDir());
    return { freeBytes: stats.bavail * stats.bsize, requiredBytes: VOICE_REQUIRED_BYTES };
  } catch {
    // Sem como medir (plataforma estranha): nao bloqueia por precaucao falsa.
    return { freeBytes: Number.MAX_SAFE_INTEGER, requiredBytes: VOICE_REQUIRED_BYTES };
  }
}

/** Baixa os dois modelos (uma vez); chamadas concorrentes compartilham a promise. */
export function ensureEmbeddedModels(): Promise<void> {
  const runtimeMissing = Boolean(process.versions.electron) && !bundledVoiceNode() && voiceNodeArchive(process.platform, process.arch) !== null;
  if (embeddedModelsReady() && !runtimeMissing) return Promise.resolve();
  if (downloadPromise) return downloadPromise;
  const space = voiceDiskSpace();
  if (space.freeBytes < space.requiredBytes) {
    const freeGb = (space.freeBytes / 1024 ** 3).toFixed(1).replace('.', ',');
    downloadState = {
      downloading: false,
      percent: 0,
      error: `Espaco em disco insuficiente: o download precisa de cerca de 2 GB livres e voce tem ${freeGb} GB.`,
    };
    return Promise.reject(new Error(downloadState.error));
  }
  downloadState = { downloading: true, percent: 0, error: null };
  downloadPromise = (async () => {
    try {
      const runtimeMb = process.versions.electron ? VOICE_NODE.sizeMb : 0;
      const totalMb = PARAKEET.sizeMb + KOKORO.sizeMb + runtimeMb;
      const weighted = (doneMb: number, currentMb: number, percent: number) =>
        Math.min(100, Math.round(((doneMb + (percent / 100) * currentMb) / totalMb) * 100));
      await ensureModel(PARAKEET, (percent) => {
        downloadState.percent = weighted(0, PARAKEET.sizeMb, percent);
      });
      await ensureModel(KOKORO, (percent) => {
        downloadState.percent = weighted(PARAKEET.sizeMb, KOKORO.sizeMb, percent);
      });
      if (runtimeMb > 0) {
        try {
          await ensureVoiceNode((percent) => {
            downloadState.percent = weighted(PARAKEET.sizeMb + KOKORO.sizeMb, VOICE_NODE.sizeMb, percent);
          });
        } catch {
          // Sem runtime embarcado: speakPcm cai no Node do sistema (se houver).
        }
      }
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
export function embeddedDownloadStatus(): DownloadState & { ready: boolean; freeBytes: number; requiredBytes: number } {
  return { ready: embeddedModelsReady(), ...downloadState, ...voiceDiskSpace() };
}

// -- Inferencia em subprocesso (servidor/UI nunca congelam) -------------------
// O TTS do sherpa-onnx usa buffers EXTERNOS (memoria nativa), que o V8 sandbox
// do Electron proibe ("External buffers are not allowed") — nem fork ajuda se
// o filho roda sob o binario do Electron. Por isso o subprocesso de voz roda
// sob um Node real: o runtime embarcado (baixado junto com os modelos) ou,
// em ultimo caso, um Node do sistema.

type VoiceJob = { resolve: (value: unknown) => void; reject: (error: Error) => void };

let child: ChildProcess | null = null;
let jobSeq = 0;
const pending = new Map<number, VoiceJob>();

/** Sem jobs por este tempo, o filho morre e libera a RAM dos modelos (~1 GB). */
const VOICE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
let idleTimer: NodeJS.Timeout | null = null;

function clearIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function killChild(): void {
  clearIdleTimer();
  if (child) {
    child.kill();
    child = null;
  }
}

/** Reagenda o desligamento por inatividade (chamado a cada job concluido). */
function scheduleIdleShutdown(): void {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (pending.size === 0) killChild();
  }, VOICE_IDLE_TIMEOUT_MS);
  idleTimer.unref();
}

let resolvedNode: string | null | undefined;

/** Node real para o subprocesso de voz; undefined = usar o processo atual. */
function resolveVoiceNode(): string | undefined {
  // Dev/testes rodam sob Node de verdade — nada a resolver.
  if (!process.versions.electron) return undefined;
  if (resolvedNode !== undefined) return resolvedNode ?? undefined;
  const candidates: string[] = [];
  if (process.env.ORKESTRAI_VOICE_NODE) candidates.push(process.env.ORKESTRAI_VOICE_NODE);
  // Runtime embarcado (baixado com os modelos) — nao depende do usuario ter Node.
  const bundled = bundledVoiceNode();
  if (bundled) candidates.push(bundled);
  candidates.push('node');
  if (process.platform === 'darwin') {
    candidates.push('/opt/homebrew/bin/node', '/usr/local/bin/node');
  } else if (process.platform === 'linux') {
    candidates.push('/usr/bin/node', '/usr/local/bin/node', '/snap/bin/node');
  }
  // nvm (apps de GUI no mac nao herdam o PATH do shell)
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  try {
    const nvmDir = join(home, '.nvm', 'versions', 'node');
    const versions = readdirSync(nvmDir).sort().reverse();
    for (const version of versions) {
      candidates.push(join(nvmDir, version, 'bin', process.platform === 'win32' ? 'node.exe' : 'node'));
    }
  } catch {
    // sem nvm
  }
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { timeout: 5_000, stdio: 'pipe' });
      resolvedNode = candidate;
      return candidate;
    } catch {
      // proximo candidato
    }
  }
  resolvedNode = null;
  return undefined; // sem node real: STT funciona sob Electron; TTS reporta erro claro
}

function voiceWorker(): ChildProcess {
  if (child) return child;
  const workerPath = join(process.cwd(), 'src', 'lib', 'modules', 'agent-room', 'infrastructure', 'voice', 'voice-worker.mjs');
  const execPath = resolveVoiceNode();
  child = fork(workerPath, [], {
    ...(execPath ? { execPath } : {}),
    env: {
      ...process.env,
      VOICE_PARAKEET_DIR: join(voiceModelsDir(), PARAKEET.dir),
      VOICE_KOKORO_DIR: join(voiceModelsDir(), KOKORO.dir),
      VOICE_PT_VOICES: JSON.stringify(KOKORO_PT_VOICES),
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.on('message', (message: { id: number; ok: boolean; error?: string } & Record<string, unknown>) => {
    const job = pending.get(message.id);
    pending.delete(message.id);
    if (pending.size === 0) scheduleIdleShutdown();
    if (!job) return;
    if (message.ok) job.resolve(message);
    else job.reject(new Error(message.error ?? 'Falha na inferencia de voz.'));
  });
  const fail = (error: Error) => {
    for (const job of pending.values()) job.reject(error);
    pending.clear();
    clearIdleTimer();
    child = null;
  };
  child.on('error', fail);
  child.on('exit', (code, signal) => {
    // Saida por kill nosso (idle/delete) nao e falha: code null + signal.
    if (code !== 0 && code !== null) fail(new Error(`Processo de voz saiu com codigo ${code}.`));
    else if (signal && code !== 0) fail(new Error(`Processo de voz morto por ${signal}.`));
    else if (child) {
      // Saiu sozinho com codigo 0 (nao deveria) — limpa o estado.
      clearIdleTimer();
      child = null;
    }
  });
  child.unref();
  return child;
}

function dispatch<T>(kind: string, payload: unknown): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const id = (jobSeq += 1);
    pending.set(id, { resolve: resolvePromise as (value: unknown) => void, reject });
    clearIdleTimer();
    try {
      voiceWorker().send({ id, kind, payload }, (error) => {
        // Canal IPC fechado no meio do envio: settle imediato, sem vazar o job.
        if (!error) return;
        const job = pending.get(id);
        pending.delete(id);
        job?.reject(error instanceof Error ? error : new Error(String(error)));
      });
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** Transcreve PCM16 mono 16 kHz para texto (Parakeet-TDT v3, CPU). */
export async function transcribePcm(samples: Float32Array): Promise<string> {
  const result = await dispatch<{ text: string }>('transcribe', { samples: Array.from(samples) });
  return result.text;
}

/** Sintetiza texto em amostras Float32 com uma voz pt-BR do Kokoro. */
export async function speakPcm(
  text: string,
  voice = 'pf_dora'
): Promise<{ samples: Float32Array; sampleRate: number }> {
  if (process.versions.electron && !resolveVoiceNode()) {
    throw new Error('A voz falada precisa do Node.js instalado neste computador.');
  }
  const result = await dispatch<{ samples: number[]; sampleRate: number }>('speak', { text, voice });
  return { samples: Float32Array.from(result.samples), sampleRate: result.sampleRate };
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
  killChild();
  downloadPromise = null;
  downloadState = { downloading: false, percent: 0, error: null };
  rmSync(voiceModelsDir(), { recursive: true, force: true });
}

export const EMBEDDED_MODELS_SIZE_MB = PARAKEET.sizeMb + KOKORO.sizeMb + VOICE_NODE.sizeMb;
