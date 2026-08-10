import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { handlePtyConnection } from '$lib/modules/agent-room/infrastructure/pty/pty-ws.js';

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = this.OPEN;
  frames: Array<Record<string, unknown>> = [];

  send(frame: string) {
    this.frames.push(JSON.parse(frame) as Record<string, unknown>);
  }
}

describe('PTY WebSocket protocol', () => {
  it('classifica attach de sessao inexistente com codigo estavel', () => {
    const socket = new FakeSocket();
    handlePtyConnection(socket as never);

    socket.emit('message', JSON.stringify({ type: 'attach', sessionId: 'morta-123' }));

    expect(socket.frames).toContainEqual({
      type: 'error',
      code: 'PTY_SESSION_NOT_FOUND',
      sessionId: 'morta-123',
      message: 'Sessão PTY não encontrada: morta-123',
    });
    socket.emit('close');
  });
});
