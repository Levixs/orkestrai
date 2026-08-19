import { Controller } from '@beeblock/svelar/routing';
import { DesignPresenceHeartbeatDto, LeaveDesignPresenceDto } from '$lib/modules/agent-room/application/dto/DesignCollaborationDtos.js';
import { designCollaborationService } from '$lib/modules/agent-room/application/services/DesignCollaborationService.js';
import { designDocumentService } from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import { DesignPresenceHeartbeatRequest, LeaveDesignPresenceRequest } from '$lib/modules/agent-room/interface/http/requests/DesignCollaborationRequests.js';

export class DesignCollaborationController extends Controller {
  async show(event: any) {
    try {
      const document = await designDocumentService.get(event.params.id, event.params.nodeId);
      const participantId = event.url.searchParams.get('participantId');
      return this.json({ data: designCollaborationService.snapshot(event.params.id, event.params.nodeId, participantId, document) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Design collaboration is unavailable.' }, 404);
    }
  }

  async heartbeat(event: any) {
    try {
      const input = await DesignPresenceHeartbeatRequest.validate(event);
      const dto = DesignPresenceHeartbeatDto.from(event.params.id, event.params.nodeId, input);
      const document = await designDocumentService.get(dto.workspaceId, dto.nodeId);
      return this.json({ data: designCollaborationService.heartbeat(dto.workspaceId, dto.nodeId, dto.input, document) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Failed to update design presence.' }, 422);
    }
  }

  async leave(event: any) {
    try {
      const input = await LeaveDesignPresenceRequest.validate(event);
      const dto = LeaveDesignPresenceDto.from(event.params.id, event.params.nodeId, input);
      designCollaborationService.leave(dto.workspaceId, dto.nodeId, dto.participantId);
      return this.json({ data: { left: true } });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Failed to leave design collaboration.' }, 422);
    }
  }
}
