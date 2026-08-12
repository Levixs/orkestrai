import { Controller } from '@beeblock/svelar/routing';
import { controlCenterService } from '$lib/modules/agent-room/application/services/ControlCenterService.js';

export class ControlCenterController extends Controller {
  async show(event: any) {
    try {
      return this.json({ data: await controlCenterService.snapshot(event.params.id) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Falha ao carregar a central de controle.' }, 500);
    }
  }

  async summaries() {
    try {
      return this.json({ data: await controlCenterService.summaries() });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Falha ao carregar a atividade dos workspaces.' }, 500);
    }
  }
}
