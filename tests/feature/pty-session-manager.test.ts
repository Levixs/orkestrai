import { describe, expect, it } from 'vitest';
import { spawn } from 'node-pty';
import { PtySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.js';

/**
 * Integracao real com node-pty usando /bin/cat (echo de terminal).
 * Nao depende de nenhuma CLI de agente.
 */
describe('PtySessionManager', () => {
  it('cria sessao, faz roundtrip de escrita/leitura e replay de scrollback', async () => {
    const manager = new PtySessionManager(spawn);
    const session = manager.create({ command: '/bin/cat', cwd: process.cwd(), cols: 80, rows: 24 });

    expect(session.id).toHaveLength(36);
    expect(manager.get(session.id)?.exited).toBe(false);

    let received = '';
    const { detach } = manager.attach(session.id, (data) => {
      received += data;
    });

    manager.write(session.id, 'ola pty\n');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(received).toContain('ola pty');

    // Segundo attach recebe o scrollback acumulado (reattach apos reload).
    const replay = manager.attach(session.id, () => {});
    expect(replay.scrollback).toContain('ola pty');
    replay.detach();
    detach();

    manager.kill(session.id);
    expect(manager.get(session.id)).toBeNull();
  });

  it('reporta exit code e notifica listeners de saida', async () => {
    const manager = new PtySessionManager(spawn);
    const session = manager.create({ command: '/bin/sh', args: ['-c', 'exit 3'], cwd: process.cwd() });

    const exitCode = await new Promise<number>((resolve) => {
      manager.attach(session.id, () => {}, resolve);
    });

    expect(exitCode).toBe(3);
    expect(manager.get(session.id)?.exited).toBe(true);
    expect(manager.get(session.id)?.exitCode).toBe(3);
    manager.kill(session.id);
  });

  it('resize nao falha em sessao finalizada e write em sessao morta erro claro', async () => {
    const manager = new PtySessionManager(spawn);
    const session = manager.create({ command: '/bin/sh', args: ['-c', 'exit 0'], cwd: process.cwd() });
    await new Promise<number>((resolve) => manager.attach(session.id, () => {}, resolve));

    expect(() => manager.resize(session.id, 100, 40)).not.toThrow();
    expect(() => manager.write(session.id, 'x')).toThrowError(/ja finalizada/);
    manager.kill(session.id);
  });

  it('marca sessao como aguardando atencao apos silencio e limpa ao escrever', async () => {
    const manager = new PtySessionManager(spawn);
    const session = manager.create({ command: '/bin/cat', cwd: process.cwd() });

    const attentionStates: boolean[] = [];
    const { detach } = manager.attach(session.id, () => {}, undefined, (waiting) => attentionStates.push(waiting));

    manager.write(session.id, 'oi\n');
    await new Promise((resolve) => setTimeout(resolve, 3_200));
    expect(manager.get(session.id)?.waiting).toBe(true);

    manager.write(session.id, 'acordou\n');
    expect(manager.get(session.id)?.waiting).toBe(false);

    detach();
    manager.kill(session.id);
    expect(attentionStates).toContain(true);
    expect(attentionStates.at(-1)).toBe(false);
  });
});
