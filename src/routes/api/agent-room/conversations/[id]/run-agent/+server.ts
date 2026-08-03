import { json, type RequestHandler } from '@sveltejs/kit';
import type { RunAgentPayload } from '$lib/modules/agent-room/domain/types.js';
import { handleRunAgent } from '$lib/modules/agent-room/application/orchestrator.js';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = (await request.json()) as Partial<RunAgentPayload>;
    const result = await handleRunAgent(params.id!, {
      message: String(body.message ?? ''),
      target: body.target ?? 'codex',
      mode: body.mode ?? 'chat',
      allowWrites: Boolean(body.allowWrites),
      projectPath: body.projectPath ?? null,
    });

    return json({ data: result });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao executar agente.' }, { status: 400 });
  }
};
