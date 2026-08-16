import { Controller } from '@beeblock/svelar/routing';
import { ApplyDesignOperationsDto } from '$lib/modules/agent-room/application/dto/DesignDtos.js';
import {
  DesignRevisionConflictError,
  designDocumentService,
} from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import { ApplyDesignOperationsRequest } from '$lib/modules/agent-room/interface/http/requests/DesignRequests.js';

export class DesignDocumentController extends Controller {
  async show(event: any) {
    try {
      return this.json({ data: await designDocumentService.get(event.params.id, event.params.nodeId) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Design document not found.' }, 404);
    }
  }

  async apply(event: any) {
    try {
      const input = await ApplyDesignOperationsRequest.validate(event);
      return this.json({ data: await designDocumentService.apply(ApplyDesignOperationsDto.from(event.params.id, event.params.nodeId, input)) });
    } catch (error) {
      if (error instanceof DesignRevisionConflictError) {
        return this.json({ error: 'design_revision_conflict', data: error.current }, 409);
      }
      return this.json({ error: error instanceof Error ? error.message : 'Failed to update design document.' }, 400);
    }
  }
}
