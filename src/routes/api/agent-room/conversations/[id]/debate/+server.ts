import { json, type RequestHandler } from '@sveltejs/kit';
import { handleDebate } from '$lib/modules/agent-room/application/orchestrator.js';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await handleDebate(params.id!, String(body.message ?? body.topic ?? ''));
    return json({ data: result });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao executar debate.' }, { status: 400 });
  }
};
