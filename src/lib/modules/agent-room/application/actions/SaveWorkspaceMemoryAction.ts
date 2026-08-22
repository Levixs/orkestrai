import { Action } from '@beeblock/svelar/actions';
import type { WorkspaceMemoryEntry } from '../../domain/types.js';
import type { SaveWorkspaceMemoryDto } from '../dto/WorkspaceMemoryDto.js';
import { workspaceMemoryService } from '../services/WorkspaceMemoryService.js';

export class SaveWorkspaceMemoryAction extends Action<SaveWorkspaceMemoryDto, WorkspaceMemoryEntry> {
  async execute(input: SaveWorkspaceMemoryDto): Promise<WorkspaceMemoryEntry> {
    return workspaceMemoryService.create(input.workspaceId, input.input);
  }
}

export const saveWorkspaceMemoryAction = new SaveWorkspaceMemoryAction();
