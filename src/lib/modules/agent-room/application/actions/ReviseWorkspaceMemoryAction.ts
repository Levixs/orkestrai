import { Action } from '@beeblock/svelar/actions';
import type { WorkspaceMemoryEntry } from '../../domain/types.js';
import type { ReviseWorkspaceMemoryDto } from '../dto/WorkspaceMemoryDto.js';
import { workspaceMemoryService } from '../services/WorkspaceMemoryService.js';

export class ReviseWorkspaceMemoryAction extends Action<ReviseWorkspaceMemoryDto, WorkspaceMemoryEntry> {
  async execute(input: ReviseWorkspaceMemoryDto): Promise<WorkspaceMemoryEntry> {
    return workspaceMemoryService.revise(input.workspaceId, input.id, input.input);
  }
}

export const reviseWorkspaceMemoryAction = new ReviseWorkspaceMemoryAction();
