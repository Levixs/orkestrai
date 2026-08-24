import { Controller } from '@beeblock/svelar/routing';
import { SaveProviderProfileDto } from '$lib/modules/agent-room/application/dto/ProviderProfileDto.js';
import {
  ProviderProfileError,
  providerProfileService,
} from '$lib/modules/agent-room/application/services/ProviderProfileService.js';
import { SaveProviderProfileRequest } from '$lib/modules/agent-room/interface/http/requests/ProviderProfileRequests.js';

/** Perfis de multi-conta por provider — globais, nao por workspace. */
export class ProviderProfileController extends Controller {
  async list(event: any) {
    const url = new URL(event.request.url);
    return this.json({ data: await providerProfileService.list(url.searchParams.get('providerId') ?? undefined) });
  }

  async create(event: any) {
    try {
      const input = await SaveProviderProfileRequest.validate(event);
      return this.json({ data: await providerProfileService.create(SaveProviderProfileDto.from(input)) }, 201);
    } catch (error) {
      return this.errorResponse(error, 'profile_save_failed');
    }
  }

  async update(event: any) {
    try {
      const input = await SaveProviderProfileRequest.validate(event);
      return this.json({ data: await providerProfileService.update(event.params.id, SaveProviderProfileDto.from(input)) });
    } catch (error) {
      return this.errorResponse(error, 'profile_save_failed');
    }
  }

  async remove(event: any) {
    try {
      await providerProfileService.delete(event.params.id);
      return this.json({ data: { deleted: true } });
    } catch (error) {
      return this.errorResponse(error, 'profile_delete_failed');
    }
  }

  private errorResponse(error: unknown, fallback: string, status = 400) {
    return this.json({
      error: error instanceof ProviderProfileError ? error.code : fallback,
    }, status);
  }
}
