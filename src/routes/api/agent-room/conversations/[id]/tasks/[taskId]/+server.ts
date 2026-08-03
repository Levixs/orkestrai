import { json, type RequestHandler } from '@sveltejs/kit';
import type { UpdateTaskPayload } from '$lib/modules/agent-room/domain/types.js';
import { updateTask } from '$lib/modules/agent-room/application/orchestrator.js';
import { AgentRoomController } from '$lib/modules/agent-room/interface/http/controllers/AgentRoomController.js';

const ctrl = new AgentRoomController();

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as UpdateTaskPayload;
    const task = await updateTask(params.taskId!, {
      title: body.title,
      description: body.description,
      status: body.status,
      assigneeId: body.assigneeId,
    });

    return json({ data: task });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao atualizar task.' }, { status: 400 });
  }
};

export const DELETE = ctrl.handle('deleteTask');
