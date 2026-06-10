import type { RequestHandler } from '@sveltejs/kit';
import { handleDebate } from '$lib/modules/agent-room/application/orchestrator.js';
import { createAgentRoomStream } from '$lib/modules/agent-room/application/streaming.js';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = await request.json().catch(() => ({}));

  return createAgentRoomStream((emit) =>
    handleDebate(params.id, String(body.message ?? body.topic ?? ''), {
      signal: request.signal,
      onProgress: emit,
    })
  );
};
