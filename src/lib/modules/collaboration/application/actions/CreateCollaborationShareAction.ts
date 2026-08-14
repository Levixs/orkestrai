import { Action } from '@beeblock/svelar/actions';
import type { CreateCollaborationShareDto } from '../dto/CollaborationDto.js';
import { collaborationShareService } from '../services/CollaborationShareService.js';

interface CreateCollaborationShareActionInput {
  workspaceId: string;
  dto: CreateCollaborationShareDto;
}

export class CreateCollaborationShareAction extends Action<CreateCollaborationShareActionInput, Awaited<ReturnType<typeof collaborationShareService.create>>> {
  async execute(input: CreateCollaborationShareActionInput) {
    return collaborationShareService.create(input.workspaceId, input.dto);
  }
}
