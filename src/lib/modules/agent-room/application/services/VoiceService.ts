import { settingsService } from './SettingsService.js';
import { embeddedModelsReady, speakPcm, transcribePcm, wavToPcm16, pcmToWav } from '../../infrastructure/voice/EmbeddedVoice.js';

const DEFAULT_VOICE_STACK_URL = 'http://localhost:8000';
const DEFAULT_STT_MODEL = 'whisper-large-v3-turbo';
const DEFAULT_TTS_VOICE = 'pf_dora';
/** STT: primeiro uso baixa o modelo (~1,5 GB) — timeout generoso. */
const STT_TIMEOUT_MS = 600_000;
/** TTS: modelo menor (Kokoro ~300 MB no 1o uso). */
const TTS_TIMEOUT_MS = 300_000;

export type VoiceHealth = { ok: boolean; url: string; detail?: string };

/** WAV PCM16 mono -> Float32Array (+resample linear se nao for 16 kHz). */
/**
 * Voz do app: motor EMBARCADO (sherpa-onnx nativo, sem Docker/Python) por
 * padrao; sidecar voice-stack (Docker, API compativel com OpenAI) como opcao
 * avancada. O backend vem da setting voiceBackend.
 */
export class VoiceService {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly settings: { get(key: string): Promise<string> } = settingsService
  ) {}

  private async baseUrl(): Promise<string> {
    const url = await this.settings.get('voiceStackUrl');
    return (url || DEFAULT_VOICE_STACK_URL).replace(/\/$/, '');
  }

  private async sttModel(): Promise<string> {
    return (await this.settings.get('voiceSttModel')) || DEFAULT_STT_MODEL;
  }

  private async ttsVoice(): Promise<string> {
    return (await this.settings.get('voiceTtsVoice')) || DEFAULT_TTS_VOICE;
  }

  async health(): Promise<VoiceHealth> {
    const backend = await this.backend();
    if (backend === 'embedded') {
      return {
        ok: true,
        url: 'embedded',
        detail: embeddedModelsReady() ? 'motor local ativo' : 'motor local — baixa ~740 MB na 1a vez',
      };
    }
    const url = await this.baseUrl();
    try {
      const response = await this.fetchFn(`${url}/health`, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return { ok: false, url, detail: `HTTP ${response.status}` };
      const payload = (await response.json()) as { device?: string };
      return { ok: true, url, detail: payload.device ? `device: ${payload.device}` : undefined };
    } catch (error) {
      return { ok: false, url, detail: error instanceof Error ? error.message.split('\n')[0] : 'fora do ar' };
    }
  }

  /** Transcreve audio: WAV PCM16 16 kHz no modo embarcado; blob cru no sidecar. */
  async transcribe(audio: Buffer, filename: string, language?: string | null): Promise<string> {
    const backend = await this.backend();
    if (backend === 'embedded') {
      const { samples } = wavToPcm16(audio);
      return transcribePcm(samples);
    }
    const url = await this.baseUrl();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)]), filename);
    form.append('model', await this.sttModel());
    if (language && language !== 'auto') form.append('language', language);

    let response: Response;
    try {
      response = await this.fetchFn(`${url}/v1/audio/transcriptions`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(this.offlineMessage(url, error));
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`STT do sidecar falhou (HTTP ${response.status}): ${detail.slice(0, 200)}`);
    }
    const payload = (await response.json()) as { text?: string };
    return (payload.text ?? '').trim();
  }

  /** Sintetiza texto em audio (wav) com a voz configurada. */
  async speak(text: string, voice?: string): Promise<Buffer> {
    const backend = await this.backend();
    if (backend === 'embedded') {
      const { samples, sampleRate } = await speakPcm(text, voice ?? (await this.ttsVoice()));
      return pcmToWav(samples, sampleRate);
    }
    const url = await this.baseUrl();
    let response: Response;
    try {
      response = await this.fetchFn(`${url}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'kokoro', voice: voice ?? (await this.ttsVoice()), input: text.slice(0, 2_000) }),
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(this.offlineMessage(url, error));
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`TTS do sidecar falhou (HTTP ${response.status}): ${detail.slice(0, 200)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async backend(): Promise<'embedded' | 'sidecar'> {
    return (await this.settings.get('voiceBackend')) === 'sidecar' ? 'sidecar' : 'embedded';
  }

  private offlineMessage(url: string, error: unknown): string {
    const cause = error instanceof Error ? error.message.split('\n')[0] : '';
    return `Sidecar de voz fora do ar em ${url} (${cause}). Suba com: cd voice-stack && docker compose up --build`;
  }
}

export const voiceService = new VoiceService();
