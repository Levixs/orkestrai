import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { handlePtyConnection } from '$lib/modules/agent-room/infrastructure/pty/pty-ws.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';

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

  it('redimensiona a PTY para o viewport que esta restaurando a sessao', () => {
    const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp', cols: 40, rows: 8 });
    const socket = new FakeSocket();
    handlePtyConnection(socket as never);

    try {
      socket.emit('message', JSON.stringify({
        type: 'attach',
        sessionId: session.id,
        cols: 132,
        rows: 36,
      }));

      expect(ptySessionManager.get(session.id)).toMatchObject({ cols: 132, rows: 36 });
      expect(socket.frames.some((frame) => frame.type === 'attached')).toBe(true);
    } finally {
      socket.emit('close');
      ptySessionManager.kill(session.id);
    }
  });
});
