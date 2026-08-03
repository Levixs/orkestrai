import { Controller } from '@beeblock/svelar/routing';
import { handleAgentLoop } from '$lib/modules/agent-room/application/orchestrator.js';
import { createAgentRoomStream } from '$lib/modules/agent-room/application/streaming.js';
import { DeleteTaskAction } from '$lib/modules/agent-room/application/actions/DeleteTaskAction.js';
import { DeleteTaskDto } from '$lib/modules/agent-room/application/dto/AgentRoomDtos.js';
import { AgentLoopRequest } from '$lib/modules/agent-room/interface/http/requests/AgentLoopRequest.js';

const deleteTaskAction = new DeleteTaskAction();

export class AgentRoomController extends Controller {
  async runLoop(event: any) {
    try {
      const dto = await AgentLoopRequest.validate(event);
      const result = await handleAgentLoop(event.params.id, dto.toPayload());
      return this.json({ data: result });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Falha ao executar loop.' }, 400);
    }
  }

  async streamLoop(event: any) {
    const dto = await AgentLoopRequest.validate(event);
    return createAgentRoomStream((emit) =>
      handleAgentLoop(event.params.id, dto.toPayload(), {
        signal: event.request.signal,
        onProgress: emit,
      })
    );
  }

  async deleteTask(event: any) {
    try {
      const result = await deleteTaskAction.execute(new DeleteTaskDto(event.params.id, event.params.taskId));
      return this.json({ data: result });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Falha ao remover task.' }, 400);
    }
  }
}
