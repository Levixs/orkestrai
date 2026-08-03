import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { taskBoardService } from '$lib/modules/agent-room/application/services/TaskBoardService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';

async function createWorkspaceWithTerminal() {
  const workspace = await workspaceRepository.createWorkspace({ name: 'board', workingDir: '/tmp' });
  const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
  const terminal = await workspaceRepository.createNode({
    workspaceId: workspace.id,
    type: 'terminal',
    title: 'Gato',
    payload: { command: '/bin/cat', sessionId: session.id },
  });
  return { workspace, terminal, session };
}

async function createWorkspaceWithLeader() {
  const workspace = await workspaceRepository.createWorkspace({ name: 'board-leader', workingDir: '/tmp' });
  const leaderSession = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
  const leader = await workspaceRepository.createNode({
    workspaceId: workspace.id,
    type: 'terminal',
    title: 'Lider',
    payload: { command: 'claude', provider: 'claude', maestro: true, sessionId: leaderSession.id },
  });
  return { workspace, leader, leaderSession };
}

describe('TaskBoardService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('cria, move, atribui e remove tarefas', async () => {
    const { workspace, terminal, session } = await createWorkspaceWithTerminal();

    const task = await taskBoardService.create(workspace.id, { title: 'Revisar PR' });
    expect(task.status).toBe('todo');
    expect(task.assigneeNodeId).toBeNull();

    const doing = await taskBoardService.update(workspace.id, task.id, { status: 'doing' });
    expect(doing.status).toBe('doing');

    const assigned = await taskBoardService.update(workspace.id, task.id, { assigneeNodeId: terminal.id });
    expect(assigned.assigneeNodeId).toBe(terminal.id);
    expect(assigned.status).toBe('doing'); // atribuir move para doing automaticamente

    const done = await taskBoardService.update(workspace.id, task.id, { status: 'done' });
    expect(done.status).toBe('done');

    expect(await taskBoardService.list(workspace.id)).toHaveLength(1);
    await taskBoardService.remove(workspace.id, task.id);
    expect(await taskBoardService.list(workspace.id)).toHaveLength(0);
    ptySessionManager.kill(session.id);
  });

  it('despacha o prompt no terminal ao atribuir (loop continuo)', async () => {
    const { workspace, terminal, session } = await createWorkspaceWithTerminal();

    // /bin/cat ecoa tudo que recebe — o prompt despachado aparece no scrollback
    const task = await taskBoardService.create(workspace.id, { title: 'Implementar login', assigneeNodeId: terminal.id });
    expect(task.status).toBe('doing');
    await new Promise((resolve) => setTimeout(resolve, 400));
    const { scrollback, detach } = ptySessionManager.attach(session.id, () => {});
    detach();
    expect(scrollback).toContain('Implementar login');
    expect(scrollback).toContain('orkestrai task done');
    ptySessionManager.kill(session.id);
  });

  it('criada com assignee ja nasce doing; titulo vazio falha', async () => {
    const { workspace, session } = await createWorkspaceWithTerminal();
    await expect(taskBoardService.create(workspace.id, { title: '  ' })).rejects.toThrow('titulo');
    ptySessionManager.kill(session.id);
  });

  it('anexa e remove imagens de referencia (capa = primeira)', async () => {
    const { workspace, session } = await createWorkspaceWithTerminal();
    const task = await taskBoardService.create(workspace.id, { title: 'Tela de login' });
    let updated = await taskBoardService.attachImage(workspace.id, task.id, '.orkestrai/images/a.png');
    expect(updated.images).toEqual(['.orkestrai/images/a.png']);
    expect(updated.imagePath).toBe('.orkestrai/images/a.png');

    updated = await taskBoardService.attachImage(workspace.id, task.id, '.orkestrai/images/b.png');
    expect(updated.images).toEqual(['.orkestrai/images/a.png', '.orkestrai/images/b.png']);
    expect(updated.imagePath).toBe('.orkestrai/images/a.png');

    // Duplicada nao entra de novo
    await expect(taskBoardService.attachImage(workspace.id, task.id, '.orkestrai/images/a.png')).rejects.toThrow('anexada');

    updated = await taskBoardService.detachImage(workspace.id, task.id, '.orkestrai/images/a.png');
    expect(updated.images).toEqual(['.orkestrai/images/b.png']);
    expect(updated.imagePath).toBe('.orkestrai/images/b.png');

    updated = await taskBoardService.detachImage(workspace.id, task.id, '.orkestrai/images/b.png');
    expect(updated.images).toEqual([]);
    expect(updated.imagePath).toBeNull();

    // Listagem inclui as imagens
    await taskBoardService.attachImage(workspace.id, task.id, '.orkestrai/images/ref.png');
    const listed = await taskBoardService.list(workspace.id);
    expect(listed[0].images).toEqual(['.orkestrai/images/ref.png']);
    ptySessionManager.kill(session.id);
  });

  it('task nova avisa o lider no terminal dele; task da ponte nao ecoa', async () => {
    const { workspace, leaderSession } = await createWorkspaceWithLeader();

    await taskBoardService.create(workspace.id, { title: 'Refinar hero', createdBy: 'user' });
    await new Promise((resolve) => setTimeout(resolve, 400));
    let attached = ptySessionManager.attach(leaderSession.id, () => {});
    expect(attached.scrollback).toContain('nova tarefa no quadro');
    expect(attached.scrollback).toContain('task assign');
    attached.detach();

    // Task criada por agente (bridge) nao gera aviso para o proprio lider
    const before = ptySessionManager.attach(leaderSession.id, () => {});
    before.detach();
    await taskBoardService.create(workspace.id, { title: 'Task do lider', createdBy: 'Lider' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = ptySessionManager.attach(leaderSession.id, () => {});
    expect(after.scrollback).toBe(before.scrollback);
    after.detach();

    ptySessionManager.kill(leaderSession.id);
  });
});
