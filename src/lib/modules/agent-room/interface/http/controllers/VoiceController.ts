import { Controller } from '@beeblock/svelar/routing';
import { voiceService } from '$lib/modules/agent-room/application/services/VoiceService.js';
import { settingsService } from '$lib/modules/agent-room/application/services/SettingsService.js';
import {
  deleteEmbeddedModels,
  embeddedDownloadStatus,
  embeddedModelsSize,
  ensureEmbeddedModels,
} from '$lib/modules/agent-room/infrastructure/voice/EmbeddedVoice.js';
import { z } from 'zod';

const speakSchema = z.object({
  text: z.string().trim().min(1, 'Informe o texto.'),
  voice: z.string().trim().nullish(),
});

/** Proxy do sidecar de voz (evita CORS e centraliza a URL configuravel). */
export class VoiceController extends Controller {
  async health() {
    try {
      return this.json({ data: await voiceService.health() });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao consultar o sidecar de voz.');
    }
  }

  /** Inicia o download dos modelos embarcados (compartilhado, idempotente). */
  async downloadModels() {
    try {
      void ensureEmbeddedModels().catch(() => {});
      return this.json({ data: embeddedDownloadStatus() }, 202);
    } catch (error) {
      return this.errorResponse(error, 'Falha ao iniciar o download.');
    }
  }

  /** Estado do download + tamanho em disco (polling da modal e Configuracoes). */
  async modelsStatus() {
    return this.json({ data: { ...embeddedDownloadStatus(), bytes: embeddedModelsSize() } });
  }

  /** Apaga os modelos para liberar espaco (proximo uso baixa de novo). */
  async deleteModels() {
    deleteEmbeddedModels();
    await settingsService.set('voiceModelsConfirmed', 'false');
    return this.json({ data: { deleted: true } });
  }

  async transcribe(event: any) {
    try {
      const form = await event.request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return this.errorResponse(new Error('Envie o audio em "file".'), 'Audio ausente.', 422);
      const language = typeof form.get('language') === 'string' ? String(form.get('language')) : null;
      const audio = Buffer.from(await file.arrayBuffer());
      const text = await voiceService.transcribe(audio, file.name || 'audio.webm', language);
      return this.json({ data: { text } });
    } catch (error) {
      return this.errorResponse(error, 'Falha na transcricao.');
    }
  }

  async speak(event: any) {
    try {
      const input = speakSchema.parse(await event.request.json());
      const audio = await voiceService.speak(input.text, input.voice ?? undefined);
      return new Response(new Uint8Array(audio), {
        headers: { 'content-type': 'audio/wav', 'cache-control': 'no-store' },
      });
    } catch (error) {
      return this.errorResponse(error, 'Falha na sintese de voz.');
    }
  }

  private errorResponse(error: unknown, fallback: string, status = 400) {
    return this.json({ error: error instanceof Error ? error.message : fallback }, status);
  }
}
