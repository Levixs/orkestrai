import { Controller, type RequestEvent } from '@beeblock/svelar/routing';
import { workstreamService } from '$lib/modules/agent-room/application/services/WorkstreamService.js';

export class WorkstreamController extends Controller {
  async index(event: RequestEvent) {
    try {
      return this.json({ data: await workstreamService.snapshot(event.params.id) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Could not load workstreams.' }, 400);
    }
  }
}
