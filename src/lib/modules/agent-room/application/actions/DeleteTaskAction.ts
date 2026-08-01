import { Action } from '@beeblock/svelar/actions';
import { agentRoomRepository } from '$lib/modules/agent-room/infrastructure/repositories/AgentRoomRepository.js';
import { DeleteTaskDto } from '$lib/modules/agent-room/application/dto/AgentRoomDtos.js';

export class DeleteTaskAction extends Action<DeleteTaskDto, { deleted: boolean }> {
  async execute(dto: DeleteTaskDto): Promise<{ deleted: boolean }> {
    const deleted = await agentRoomRepository.deleteTask(dto.conversationId, dto.taskId);
    if (!deleted) {
      throw new Error('Task nao encontrada.');
    }
    return { deleted: true };
  }
}
