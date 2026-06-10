import { json, type RequestHandler } from '@sveltejs/kit';
import type { AgentLoopPayload } from '$lib/modules/agent-room/domain/types.js';
import { handleAgentLoop } from '$lib/modules/agent-room/application/orchestrator.js';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = (await request.json()) as Partial<AgentLoopPayload>;
    const result = await handleAgentLoop(params.id, {
      message: String(body.message ?? ''),
      mode: body.mode ?? 'implement',
      allowWrites: Boolean(body.allowWrites),
      projectPath: body.projectPath ?? null,
      maxRounds: body.maxRounds,
    });

    return json({ data: result });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao executar loop.' }, { status: 400 });
  }
};
