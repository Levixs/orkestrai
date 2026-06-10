import type { AgentRoomProgressEvent } from './orchestrator.js';

export type AgentRoomStreamEvent =
  | AgentRoomProgressEvent
  | { type: 'done'; data: unknown }
  | { type: 'error'; error: string };

type Emit = (event: AgentRoomStreamEvent) => void;

export function createAgentRoomStream(run: (emit: Emit) => Promise<unknown>) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit: Emit = (event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const data = await run(emit);
        emit({ type: 'done', data });
      } catch (error) {
        emit({ type: 'error', error: error instanceof Error ? error.message : 'Falha ao executar agente.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
