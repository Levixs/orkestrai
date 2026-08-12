import { Controller } from '@beeblock/svelar/routing';
import { portalDesignFeedbackService } from '$lib/modules/agent-room/application/services/PortalDesignFeedbackService.js';
import { SendPortalDesignFeedbackRequest } from '../requests/SendPortalDesignFeedbackRequest.js';

export class PortalDesignFeedbackController extends Controller {
  async send(event: any) {
    try {
      const dto = await SendPortalDesignFeedbackRequest.validate(event);
      return this.json({
        data: await portalDesignFeedbackService.send(event.params.id, event.params.nodeId, dto),
      });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Falha ao enviar feedback visual.' }, 422);
    }
  }
}
