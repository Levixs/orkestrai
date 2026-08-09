import { describe, expect, it, vi } from 'vitest';
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
    expect(() => manager.write(session.id, 'x')).toThrowError(/já finalizada/);
    manager.kill(session.id);
  });

  it('marca sessao como ociosa apos silencio e limpa ao escrever', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('[orkestrai:attention]'));
    logSpy.mockRestore();
  });

  it('writeWithSubmit envia texto e Enter em writes separados (~200ms)', async () => {
    const writes: string[] = [];
    const fakePty = {
      write: (data: string) => {
        writes.push(data);
      },
      resize: () => {},
      kill: () => {},
      onData: () => ({ dispose: () => {} }),
      onExit: () => ({ dispose: () => {} }),
      pid: 1,
    };
    const manager = new PtySessionManager((() => fakePty) as unknown as typeof spawn);

    const session = manager.create({ command: 'codex', cwd: process.cwd() });
    await manager.writeWithSubmit(session.id, 'faz a tarefa X');

    expect(writes).toEqual(['faz a tarefa X', '\r']);
  });

  it('aguarda o rascunho humano antes de entregar uma mensagem automatica', async () => {
    const writes: string[] = [];
    const fakePty = {
      write: (data: string) => writes.push(data),
      resize: () => {},
      kill: () => {},
      onData: () => ({ dispose: () => {} }),
      onExit: () => ({ dispose: () => {} }),
      pid: 1,
    };
    const manager = new PtySessionManager((() => fakePty) as unknown as typeof spawn);
    const session = manager.create({ command: 'claude', cwd: process.cwd() });

    manager.writeHumanInput(session.id, 'minha mensagem');
    const delivery = manager.writeWithSubmit(session.id, 'mensagem do agente', 20);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(writes).toEqual(['minha mensagem']);

    manager.writeHumanInput(session.id, '\r');
    await delivery;
    expect(writes).toEqual(['minha mensagem', '\r', 'mensagem do agente', '\r']);
  });

  it('preserva teclas humanas recebidas durante o intervalo do submit automatico', async () => {
    const writes: string[] = [];
    const fakePty = {
      write: (data: string) => writes.push(data),
      resize: () => {},
      kill: () => {},
      onData: () => ({ dispose: () => {} }),
      onExit: () => ({ dispose: () => {} }),
      pid: 1,
    };
    const manager = new PtySessionManager((() => fakePty) as unknown as typeof spawn);
    const session = manager.create({ command: 'codex', cwd: process.cwd() });

    const delivery = manager.writeWithSubmit(session.id, 'mensagem automatica', 40);
    manager.writeHumanInput(session.id, 'rascunho humano');
    expect(writes).toEqual(['mensagem automatica']);
    await delivery;
    expect(writes).toEqual(['mensagem automatica', '\r', 'rascunho humano']);
  });
});
