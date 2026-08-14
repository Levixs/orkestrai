import { Action } from '@beeblock/svelar/actions';
import type { ExecuteCollaborationCommandDto } from '../dto/CollaborationDto.js';
import type { CollaborationCommandResult } from '../../domain/types.js';
import { sharedWorkspaceCommandBus } from '../services/SharedWorkspaceCommandBus.js';

interface ExecuteCollaborationCommandActionInput { shareId: string; deviceRecordId: string; dto: ExecuteCollaborationCommandDto }

export class ExecuteCollaborationCommandAction extends Action<ExecuteCollaborationCommandActionInput, CollaborationCommandResult> {
  async execute(input: ExecuteCollaborationCommandActionInput): Promise<CollaborationCommandResult> {
    return sharedWorkspaceCommandBus.execute(input.shareId, input.deviceRecordId, input.dto);
  }
}
