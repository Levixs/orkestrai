import { Controller, type RequestEvent } from '@beeblock/svelar/routing';
import { usageService } from '$lib/modules/agent-room/application/services/UsageService.js';

/** Uso/cota dos providers (5h, semanal, mensal + reset), lido das APIs deles. */
export class UsageController extends Controller {
  async getUsage(event: RequestEvent) {
    try {
      const forceRefresh = event.url.searchParams.get('refresh') === '1';
      const usage = await usageService.getAll(forceRefresh);
      return this.json({ data: usage });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao consultar uso dos providers.');
    }
  }
}
