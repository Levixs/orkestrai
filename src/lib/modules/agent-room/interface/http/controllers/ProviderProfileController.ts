import { Controller } from '@beeblock/svelar/routing';
import { z } from 'zod';
import { providerProfileService } from '$lib/modules/agent-room/application/services/ProviderProfileService.js';

const saveProviderProfileSchema = z.object({
  providerId: z.string().trim().min(1, 'Informe o provider.'),
  name: z.string().trim().min(1, 'Informe o nome do perfil.'),
  configDir: z.string().trim().nullish(),
  dataDir: z.string().trim().nullish(),
  token: z.string().trim().nullish(),
});

/** Perfis de multi-conta por provider — globais, nao por workspace. */
export class ProviderProfileController extends Controller {
  async list(event: any) {
    const url = new URL(event.request.url);
    return this.json({ data: await providerProfileService.list(url.searchParams.get('providerId') ?? undefined) });
  }

  async create(event: any) {
    try {
      const input = saveProviderProfileSchema.parse(await event.request.json());
      return this.json({ data: await providerProfileService.create(input) }, 201);
    } catch (error) {
      return this.errorResponse(error, 'Falha ao criar perfil.');
    }
  }

  async update(event: any) {
    try {
      const input = saveProviderProfileSchema.parse(await event.request.json());
      return this.json({ data: await providerProfileService.update(event.params.id, input) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao atualizar perfil.');
    }
  }

  async remove(event: any) {
    try {
      await providerProfileService.delete(event.params.id);
      return this.json({ data: { deleted: true } });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao remover perfil.');
    }
  }

  private errorResponse(error: unknown, fallback: string, status = 400) {
    return this.json({ error: error instanceof Error ? error.message : fallback }, status);
  }
}
