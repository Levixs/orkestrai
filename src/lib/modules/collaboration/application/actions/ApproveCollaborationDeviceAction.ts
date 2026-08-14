import { Action } from '@beeblock/svelar/actions';
import type { ApproveCollaborationDeviceDto } from '../dto/CollaborationDto.js';
import { collaborationShareService } from '../services/CollaborationShareService.js';

interface ApproveCollaborationDeviceActionInput {
  workspaceId: string;
  shareId: string;
  deviceId: string;
  dto: ApproveCollaborationDeviceDto;
}

export class ApproveCollaborationDeviceAction extends Action<ApproveCollaborationDeviceActionInput, Awaited<ReturnType<typeof collaborationShareService.approve>>> {
  async execute(input: ApproveCollaborationDeviceActionInput) {
    return collaborationShareService.approve(input.workspaceId, input.shareId, input.deviceId, input.dto);
  }
}
