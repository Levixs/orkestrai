import { describe, expect, it } from 'vitest';
import {
  VoiceService,
  VOICE_MODELS_MISSING_ERROR,
} from '$lib/modules/agent-room/application/services/VoiceService.js';

function fakeFetch(routes: Record<string, { status?: number; body?: unknown; text?: string }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const route = Object.entries(routes).find(([path]) => String(url).includes(path));
    if (!route) return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as Response;
    const { status = 200, body, text } = route[1];
    return {
      ok: status < 400,
      status,
      json: async () => body ?? {},
      text: async () => text ?? JSON.stringify(body ?? ''),
      arrayBuffer: async () => new TextEncoder().encode(text ?? 'wav').buffer,
    } as Response;
  }) as typeof fetch;
  return { fn, calls };
}

const stubSettings = { get: async (key: string) => (key === 'voiceBackend' ? 'sidecar' : '') };
const embeddedSettings = { get: async () => '' };

describe('VoiceService', () => {
  it('transcribe envia multipart com modelo e idioma e retorna o texto', async () => {
    const { fn, calls } = fakeFetch({ '/v1/audio/transcriptions': { body: { text: 'ola mundo' } } });
    const service = new VoiceService(fn, stubSettings);
    const text = await service.transcribe(Buffer.from('audio'), 'ditado.webm', 'pt');
    expect(text).toBe('ola mundo');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.body).toBeInstanceOf(FormData);
  });

  it('transcribe sem idioma ("auto") nao envia language', async () => {
    const { fn, calls } = fakeFetch({ '/v1/audio/transcriptions': { body: { text: 'ok' } } });
    const service = new VoiceService(fn, stubSettings);
    await service.transcribe(Buffer.from('audio'), 'a.webm', 'auto');
    const form = calls[0].init?.body as FormData;
    expect(form.get('language')).toBeNull();
  });

  it('speak posta JSON com kokoro e a voz configurada e retorna audio', async () => {
    const { fn, calls } = fakeFetch({ '/v1/audio/speech': { text: 'wav-bytes' } });
    const service = new VoiceService(fn, stubSettings);
    const audio = await service.speak('bom dia', 'pm_alex');
    expect(audio.toString()).toBe('wav-bytes');
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toMatchObject({ model: 'kokoro', voice: 'pm_alex', input: 'bom dia' });
  });

  it('sidecar fora do ar vira mensagem com instrucao de subir', async () => {
    const down = (async () => { throw new Error('fetch failed: ECONNREFUSED'); }) as typeof fetch;
    const service = new VoiceService(down, stubSettings);
    await expect(service.transcribe(Buffer.from('a'), 'a.webm')).rejects.toThrow('docker compose up');
    await expect(service.speak('oi')).rejects.toThrow('docker compose up');
  });

  it('erro HTTP do sidecar vem com o detalhe', async () => {
    const { fn } = fakeFetch({ '/v1/audio/transcriptions': { status: 500, text: 'STT falhou: modelo nao baixado' } });
    const service = new VoiceService(fn, stubSettings);
    await expect(service.transcribe(Buffer.from('a'), 'a.webm')).rejects.toThrow('HTTP 500');
  });

  it('health retorna ok com url e device', async () => {
    const { fn } = fakeFetch({ '/health': { body: { status: 'ok', device: 'cpu' } } });
    const service = new VoiceService(fn, stubSettings);
    const health = await service.health();
    expect(health.ok).toBe(true);
    expect(health.url).toContain('localhost:8000');
    expect(health.detail).toBe('device: cpu');
  });

  it('backend embedded: health nem consulta o sidecar', async () => {
    const { fn, calls } = fakeFetch({});
    const service = new VoiceService(fn, embeddedSettings);
    const health = await service.health();
    expect(health.ok).toBe(true);
    expect(health.url).toBe('embedded');
    expect(calls).toHaveLength(0);
  });

  it('backend embedded recusa STT e TTS quando os modelos foram apagados', async () => {
    const { fn, calls } = fakeFetch({});
    const service = new VoiceService(fn, embeddedSettings, () => false);

    await expect(service.transcribe(Buffer.from('audio'), 'ditado.wav')).rejects.toThrow(VOICE_MODELS_MISSING_ERROR);
    await expect(service.speak('bom dia')).rejects.toThrow(VOICE_MODELS_MISSING_ERROR);
    expect(calls).toHaveLength(0);
  });
});
