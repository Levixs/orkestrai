import { Action } from '@beeblock/svelar/actions';
import type { WorkspaceMemoryEntry } from '../../domain/types.js';
import type { ArchiveWorkspaceMemoryDto } from '../dto/WorkspaceMemoryDto.js';
import { workspaceMemoryService } from '../services/WorkspaceMemoryService.js';

export class ArchiveWorkspaceMemoryAction extends Action<ArchiveWorkspaceMemoryDto, WorkspaceMemoryEntry> {
  async execute(input: ArchiveWorkspaceMemoryDto): Promise<WorkspaceMemoryEntry> {
    return workspaceMemoryService.archive(input.workspaceId, input.id);
  }
}

export const archiveWorkspaceMemoryAction = new ArchiveWorkspaceMemoryAction();
