import { Controller } from '@beeblock/svelar/routing';
import { FormRequest } from '@beeblock/svelar/forms';
import { taskBoardService } from '$lib/modules/agent-room/application/services/TaskBoardService.js';
import {
  createBoardTaskSchema,
  updateBoardTaskSchema,
} from '$lib/modules/agent-room/contracts/schemas/taskSchemas.js';

function requestOf(schema: unknown) {
  return class extends FormRequest {
    rules() {
      return schema;
    }
    authorize() {
      return true;
    }
  };
}

export class TaskBoardController extends Controller {
  async listTasks(event: any) {
    return this.json({ data: await taskBoardService.list(event.params.id) });
  }

  async createTask(event: any) {
    try {
      const input = await (requestOf(createBoardTaskSchema)).validate(event);
      return this.json(
        {
          data: await taskBoardService.create(event.params.id, {
            title: input.title,
            assigneeNodeId: input.assigneeNodeId ?? null,
            createdBy: input.createdBy ?? 'user',
          }),
        },
        201
      );
    } catch (error) {
      return this.errorResponse(error, 'Falha ao criar tarefa.');
    }
  }

  async updateTask(event: any) {
    try {
      const input = await (requestOf(updateBoardTaskSchema)).validate(event);
      return this.json({
        data: await taskBoardService.update(event.params.id, event.params.taskId, {
          title: input.title,
          status: input.status,
          assigneeNodeId: input.assigneeNodeId,
          imagePath: input.imagePath,
        }),
      });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao atualizar tarefa.');
    }
  }

  async removeTask(event: any) {
    try {
      await taskBoardService.remove(event.params.id, event.params.taskId);
      return this.json({ data: { deleted: true } });
    } catch (error) {
      return this.errorResponse(error, 'Tarefa nao encontrada.', 404);
    }
  }

  private errorResponse(error: unknown, fallback: string, status = 400) {
    return this.json({ error: error instanceof Error ? error.message : fallback }, status);
  }
}
