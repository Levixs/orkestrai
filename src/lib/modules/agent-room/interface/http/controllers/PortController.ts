import { Controller, type RequestEvent } from '@beeblock/svelar/routing';
import { KillManagedPortAction } from '$lib/modules/agent-room/application/actions/KillManagedPortAction.js';
import { KillManagedPortDto } from '$lib/modules/agent-room/application/dto/KillManagedPortDto.js';
import { ManagedPortError, managedPortService } from '$lib/modules/agent-room/application/services/ManagedPortService.js';
import { KillManagedPortRequest } from '$lib/modules/agent-room/interface/http/requests/KillManagedPortRequest.js';

const killManagedPortAction = new KillManagedPortAction();

export class PortController extends Controller {
  async index(event: RequestEvent) {
    try {
      return this.json({ data: await managedPortService.list(event.params.id) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao listar portas locais.');
    }
  }

  async destroy(event: RequestEvent) {
    try {
      const input = await KillManagedPortRequest.validate(event);
      const result = await killManagedPortAction.execute(KillManagedPortDto.from(event.params.id, input));
      return this.json({ data: result });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao encerrar a porta.');
    }
  }

  private errorResponse(error: unknown, fallback: string, status = 400) {
    return this.json({
      error: error instanceof Error ? error.message : fallback,
      ...(error instanceof ManagedPortError ? { code: error.code } : {}),
    }, status);
  }
}
