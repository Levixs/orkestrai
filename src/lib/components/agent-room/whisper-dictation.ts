/**
 * Ditado offline com whisper.cpp WASM (build oficial em /whisper-official/).
 * Modelo base-q5_1 baixado do HuggingFace e cacheado em IndexedDB.
 * Requer Cross-Origin Isolation (SharedArrayBuffer) — ja configurado no app.
 */

const WHISPER_MAIN_URL = '/whisper-official/main.js';
const WHISPER_SAMPLE_RATE = 16000;
const WHISPER_THREAD_COUNT = 1;
const WHISPER_MODEL_FILE = 'whisper.bin';
const WHISPER_MODEL_DB_NAME = 'orkestrai.whisper.models';
const WHISPER_MODEL_DB_VERSION = 1;

export type WhisperLanguage = 'auto' | 'pt' | 'en';

const WHISPER_MODELS: Record<WhisperLanguage, { url: string; sizeMb: number; language: string }> = {
  auto: {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
    sizeMb: 57,
    language: 'auto',
  },
  pt: {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
    sizeMb: 57,
    language: 'pt',
  },
  en: {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin',
    sizeMb: 57,
    language: 'en',
  },
};

type OfficialWhisperModule = {
  calledRun?: boolean;
  full_default?: (instance: number, audio: Float32Array, language: string, threads: number, translate: boolean) => void;
  init: (modelFile: string) => number;
  FS_unlink: (path: string) => void;
  FS_createDataFile: (dir: string, name: string, data: Uint8Array, read: boolean, write: boolean) => void;
};

type WhisperWindow = Window & { Module?: OfficialWhisperModule };

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(script);
  });
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export class WhisperDictation {
  private module: OfficialWhisperModule | null = null;
  private instance: number | null = null;
  private ready = false;
  private loadedLanguage: WhisperLanguage | null = null;
  private loadPromise: Promise<void> | null = null;
  private outputCapture: string[] | null = null;
  private workerError = '';
  private progress = 0;

  onStatus?: (text: string) => void;
  onProgress?: (percent: number) => void;

  private status(text: string) {
    this.onStatus?.(text);
  }

  private captureOutput(text: unknown) {
    const line = String(text ?? '').trim();
    if (/worker sent an error|SharedArrayBuffer|pthread/i.test(line)) {
      this.workerError = line || 'Falha ao iniciar worker do Whisper.';
    }
    if (line && this.outputCapture) {
      this.outputCapture.push(line);
    }
  }

  private openModelDb() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(WHISPER_MODEL_DB_NAME, WHISPER_MODEL_DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('models');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Falha ao abrir cache do modelo.'));
    });
  }

  private async readCachedModel(url: string) {
    try {
      const db = await this.openModelDb();
      return await new Promise<Uint8Array | null>((resolve) => {
        const request = db.transaction('models', 'readonly').objectStore('models').get(url);
        request.onsuccess = () => resolve(request.result instanceof Uint8Array ? request.result : null);
        request.onerror = () => resolve(null);
        request.transaction?.addEventListener?.('complete', () => db.close());
      });
    } catch {
      return null;
    }
  }

  private async writeCachedModel(url: string, data: Uint8Array) {
    try {
      const db = await this.openModelDb();
      await new Promise<void>((resolve) => {
        const transaction = db.transaction('models', 'readwrite');
        transaction.objectStore('models').put(data, url);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          resolve();
        };
      });
    } catch {
      // cache e otimizacao; segue sem
    }
  }

  private async fetchModel(url: string, sizeMb: number) {
    const cached = await this.readCachedModel(url);
    if (cached) {
      this.onProgress?.(100);
      this.status('Modelo carregado do cache');
      return cached;
    }

    this.status(`Baixando modelo Whisper (${sizeMb} MB)...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao baixar modelo Whisper: ${response.status}`);

    const total = Number(response.headers.get('content-length') ?? 0);
    if (!response.body) {
      const data = new Uint8Array(await response.arrayBuffer());
      await this.writeCachedModel(url, data);
      return data;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (total > 0) {
        this.progress = Math.round((received / total) * 100);
        this.onProgress?.(this.progress);
        this.status(`Baixando modelo ${this.progress}%`);
      }
    }

    const data = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    await this.writeCachedModel(url, data);
    return data;
  }

  private async ensureRuntime() {
    if (this.module?.calledRun) return this.module;
    if (!window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
      throw new Error('Whisper precisa de Cross-Origin Isolation (SharedArrayBuffer).');
    }

    this.status('Carregando runtime Whisper WASM...');
    const existing = (window as WhisperWindow).Module;
    if (existing?.calledRun) {
      this.module = existing;
      return existing;
    }

    const config = {
      print: (text: unknown) => this.captureOutput(text),
      printErr: (text: unknown) => this.captureOutput(text),
      setStatus: (text: string) => {
        if (text) this.status(text);
      },
      monitorRunDependencies: (left: number) => {
        if (left > 0) this.status(`Preparando Whisper WASM (${left})`);
      },
      onRuntimeInitialized: () => {
        this.module = config as unknown as OfficialWhisperModule;
      },
    };
    (window as WhisperWindow).Module = config as unknown as OfficialWhisperModule;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Timeout ao carregar Whisper WASM.')), 30_000);
      config.onRuntimeInitialized = () => {
        window.clearTimeout(timeout);
        this.module = config as unknown as OfficialWhisperModule;
        resolve();
      };
      loadScript(WHISPER_MAIN_URL).catch(reject);
    });

    if (!this.module?.full_default) {
      throw new Error('Runtime oficial do whisper.cpp nao expos full_default.');
    }
    return this.module;
  }

  /** Garante runtime + modelo carregados para o idioma. */
  async ensureReady(language: WhisperLanguage) {
    if (this.ready && this.module && this.loadedLanguage === language) return;
    if (this.loadPromise) return this.loadPromise;

    this.status('Carregando Whisper WASM...');
    this.onProgress?.(0);
    this.loadPromise = (async () => {
      const module = await this.ensureRuntime();
      const model = WHISPER_MODELS[language];
      const modelData = await this.fetchModel(model.url, model.sizeMb);

      try {
        module.FS_unlink(`/${WHISPER_MODEL_FILE}`);
      } catch {
        // primeiro carregamento
      }
      module.FS_createDataFile('/', WHISPER_MODEL_FILE, modelData, true, true);
      this.ready = true;
      this.loadedLanguage = language;
      this.instance = null;
      this.status('Pronto. Alt+Espaco para falar.');
    })();

    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private async decodeBlob(blob: Blob) {
    if (blob.size === 0) throw new Error('Nenhum audio foi gravado.');
    const audioContext = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE });
    try {
      const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
      const frameCount = Math.max(1, Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE));
      const offline = new OfflineAudioContext(1, frameCount, WHISPER_SAMPLE_RATE);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      return rendered.getChannelData(0);
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  }

  private extractTranscript(lines: string[]) {
    return lines
      .map((line) => line.replace(/^\s*\[[^\]]+\]\s*/g, '').replace(/\s+/g, ' ').trim())
      .filter((line) => {
        if (!line) return false;
        if (/worker sent an error|SharedArrayBuffer|pthread/i.test(line)) return false;
        if (/^(js:|whisper_|ggml_|system_info:|main:|error:|operator\(\):|loadRemote|fetchRemote)/i.test(line)) return false;
        if (/^(processing|loading|whisper_print_timings:|whisper_model_load:)/i.test(line)) return false;
        if (/\b(processing \d+ samples|threads|processors|lang =|task = transcribe)\b/i.test(line)) return false;
        if (/\b(load time|sample time|encode time|decode time|total time)\b/i.test(line)) return false;
        return true;
      })
      .join(' ')
      .trim();
  }

  private looksFinished(lines: string[]) {
    return lines.some((line) => /whisper_print_timings:|total time/i.test(line));
  }

  private async waitForTranscript(audioSeconds: number) {
    const deadline = Date.now() + Math.max(12_000, Math.min(90_000, audioSeconds * 12_000));
    let lastLineCount = this.outputCapture?.length ?? 0;
    let lastChangeAt = Date.now();

    while (Date.now() < deadline) {
      const lines = this.outputCapture ?? [];
      if (this.workerError) {
        throw new Error('Worker do Whisper falhou. Faca hard refresh para aplicar os headers COOP/COEP.');
      }
      const transcript = this.extractTranscript(lines);
      if (transcript && this.looksFinished(lines)) return transcript;
      if (lines.length !== lastLineCount) {
        lastLineCount = lines.length;
        lastChangeAt = Date.now();
      } else if (transcript && Date.now() - lastChangeAt > 1800) {
        return transcript;
      }
      this.status(`Transcrevendo ${Math.max(1, Math.round(audioSeconds))}s de audio...`);
      await wait(250);
    }
    return this.extractTranscript(this.outputCapture ?? []);
  }

  /** Transcreve um blob de audio (webm/opus etc.) e retorna o texto. */
  async transcribe(blob: Blob, language: WhisperLanguage): Promise<string> {
    await this.ensureReady(language);
    const module = this.module!;
    if (!this.instance) {
      this.instance = module.init(WHISPER_MODEL_FILE);
    }
    if (!this.instance) throw new Error('Falha ao inicializar modelo Whisper.');

    const model = WHISPER_MODELS[language];
    const audio = await this.decodeBlob(blob);
    const audioSeconds = audio.length / WHISPER_SAMPLE_RATE;

    this.outputCapture = [];
    this.workerError = '';
    this.status('Transcrevendo no navegador...');
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      module.full_default!(this.instance, audio, model.language, WHISPER_THREAD_COUNT, false);
      return await this.waitForTranscript(audioSeconds);
    } finally {
      this.outputCapture = null;
    }
  }
}

export const whisperDictation = new WhisperDictation();
