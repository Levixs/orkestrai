import type { RequestHandler } from '@sveltejs/kit';
import type { RunAgentPayload } from '$lib/modules/agent-room/domain/types.js';
import { handleRunAgent } from '$lib/modules/agent-room/application/orchestrator.js';
import { createAgentRoomStream } from '$lib/modules/agent-room/application/streaming.js';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = (await request.json()) as Partial<RunAgentPayload>;

  return createAgentRoomStream((emit) =>
    handleRunAgent(
      params.id!,
      {
        message: String(body.message ?? ''),
        target: body.target ?? 'codex',
        mode: body.mode ?? 'chat',
        allowWrites: Boolean(body.allowWrites),
        projectPath: body.projectPath ?? null,
      },
      { signal: request.signal, onProgress: emit }
    )
  );
};
