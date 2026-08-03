import { json, type RequestHandler } from '@sveltejs/kit';
import { listTasks } from '$lib/modules/agent-room/application/orchestrator.js';

export const GET: RequestHandler = async ({ params }) => {
  try {
    return json({ data: await listTasks(params.id!) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao carregar tasks.' }, { status: 400 });
  }
};
