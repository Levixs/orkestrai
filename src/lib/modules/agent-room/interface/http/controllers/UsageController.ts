import { Controller } from '@beeblock/svelar/routing';
import { usageService } from '$lib/modules/agent-room/application/services/UsageService.js';

/** Uso/cota dos providers (5h, semanal, mensal + reset), lido das APIs deles. */
export class UsageController extends Controller {
  async getUsage() {
    try {
      const usage = await usageService.getAll();
      return this.json({ data: usage });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao consultar uso dos providers.');
    }
  }
}
