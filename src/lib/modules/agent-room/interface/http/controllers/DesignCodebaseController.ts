import { Controller } from '@beeblock/svelar/routing';
import { designCodebaseService } from '$lib/modules/agent-room/application/services/DesignCodebaseService.js';

export class DesignCodebaseController extends Controller {
  async scan(event: any) {
    try {
      return this.json({ data: await designCodebaseService.scan(event.params.id) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Failed to scan the design system.' }, 422);
    }
  }
}
