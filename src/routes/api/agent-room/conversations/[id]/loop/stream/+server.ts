import type { RequestHandler } from '@sveltejs/kit';
import type { AgentLoopPayload } from '$lib/modules/agent-room/domain/types.js';
import { handleAgentLoop } from '$lib/modules/agent-room/application/orchestrator.js';
import { createAgentRoomStream } from '$lib/modules/agent-room/application/streaming.js';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = (await request.json()) as Partial<AgentLoopPayload>;

  return createAgentRoomStream((emit) =>
    handleAgentLoop(
      params.id,
      {
        message: String(body.message ?? ''),
        mode: body.mode ?? 'implement',
        allowWrites: Boolean(body.allowWrites),
        projectPath: body.projectPath ?? null,
        maxRounds: body.maxRounds,
      },
      { signal: request.signal, onProgress: emit }
    )
  );
};
