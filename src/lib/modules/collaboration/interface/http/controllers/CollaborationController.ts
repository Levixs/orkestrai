import { Controller } from '@beeblock/svelar/routing';
import { CreateCollaborationShareDto, ApproveCollaborationDeviceDto } from '../../../application/dto/CollaborationDto.js';
import { CreateCollaborationShareAction } from '../../../application/actions/CreateCollaborationShareAction.js';
import { ApproveCollaborationDeviceAction } from '../../../application/actions/ApproveCollaborationDeviceAction.js';
import { collaborationShareService } from '../../../application/services/CollaborationShareService.js';
import { collaborationRepository } from '../../../infrastructure/repositories/CollaborationRepository.js';
import { CreateCollaborationShareRequest } from '../requests/CreateCollaborationShareRequest.js';
import { ApproveCollaborationDeviceRequest } from '../requests/ApproveCollaborationDeviceRequest.js';

export class CollaborationController extends Controller {
  async status(event: any) {
    return this.run(() => collaborationShareService.status(event.params.id));
  }

  async setExperimental(event: any) {
    try {
      const body = await event.request.json();
      if (typeof body.enabled !== 'boolean') return this.json({ error: 'INVALID_FEATURE_FLAG' }, 400);
      return this.json({ data: { enabled: await collaborationShareService.setEnabled(body.enabled) } });
    } catch (error) {
      return this.failure(error);
    }
  }

  async createShare(event: any) {
    try {
      const input = await CreateCollaborationShareRequest.validate(event);
      const action = new CreateCollaborationShareAction();
      return this.json({ data: await action.execute({ workspaceId: event.params.id, dto: CreateCollaborationShareDto.from(input) }) }, 201);
    } catch (error) {
      return this.failure(error);
    }
  }

  async invite(event: any) {
    return this.run(() => collaborationShareService.invite(event.params.id, event.params.shareId));
  }

  async stopShare(event: any) {
    try {
      const share = await collaborationRepository.findShare(event.params.shareId);
      if (!share || share.workspaceId !== event.params.id) return this.json({ error: 'SHARE_NOT_FOUND' }, 404);
      await collaborationShareService.stop(share.id);
      return this.json({ data: { stopped: true } });
    } catch (error) {
      return this.failure(error);
    }
  }

  async approveDevice(event: any) {
    try {
      const input = await ApproveCollaborationDeviceRequest.validate(event);
      const action = new ApproveCollaborationDeviceAction();
      return this.json({ data: await action.execute({
        workspaceId: event.params.id,
        shareId: event.params.shareId,
        deviceId: event.params.deviceId,
        dto: ApproveCollaborationDeviceDto.from(input),
      }) });
    } catch (error) {
      return this.failure(error);
    }
  }

  async revokeDevice(event: any) {
    try {
      await collaborationShareService.revoke(event.params.id, event.params.shareId, event.params.deviceId);
      return this.json({ data: { revoked: true } });
    } catch (error) {
      return this.failure(error);
    }
  }

  private async run(callback: () => Promise<unknown>) {
    try {
      return this.json({ data: await callback() });
    } catch (error) {
      return this.failure(error);
    }
  }

  private failure(error: unknown) {
    const message = error instanceof Error ? error.message : 'COLLABORATION_REQUEST_FAILED';
    const validationErrors = error && typeof error === 'object' && 'errors' in error
      ? (error as { errors?: Record<string, string[]> }).errors
      : undefined;
    const status = message.includes('NOT_FOUND') || message.includes('UNAVAILABLE') ? 404
      : message.includes('DISABLED') ? 403
        : validationErrors ? 422
          : 400;
    return this.json({ error: message, ...(validationErrors ? { errors: validationErrors } : {}) }, status);
  }
}
