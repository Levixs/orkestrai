import { Action } from '@beeblock/svelar/actions';
import type { AgentAttentionItem } from '../../domain/types.js';
import type { UpdateAttentionDto } from '../dto/UpdateAttentionDto.js';
import { attentionService } from '../services/AttentionService.js';

export class UpdateAttentionAction extends Action<UpdateAttentionDto, AgentAttentionItem> {
  async execute(input: UpdateAttentionDto): Promise<AgentAttentionItem> {
    return attentionService.setStatus(input);
  }
}

export const updateAttentionAction = new UpdateAttentionAction();
