import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { taskBoardService } from '$lib/modules/agent-room/application/services/TaskBoardService.js';
import { workspaceService } from '$lib/modules/agent-room/application/services/WorkspaceService.js';
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
    const task = await taskBoardService.create(workspace.id, {
      title: 'Implementar login',
      description: 'Usar OAuth e cobrir o fluxo de erro.',
      images: ['.orkestrai/images/login.png'],
      assigneeNodeId: terminal.id,
    });
    expect(task.status).toBe('doing');
    await new Promise((resolve) => setTimeout(resolve, 400));
    const { scrollback, detach } = ptySessionManager.attach(session.id, () => {});
    detach();
    expect(scrollback).toContain('Implementar login');
    expect(scrollback).toContain('Usar OAuth e cobrir o fluxo de erro.');
    expect(scrollback).toContain('.orkestrai/images/login.png');
    expect(scrollback).toContain('orkestrai task done');
    ptySessionManager.kill(session.id);
  });

  it('criada com assignee ja nasce doing; titulo vazio falha', async () => {
    const { workspace, session } = await createWorkspaceWithTerminal();
    await expect(taskBoardService.create(workspace.id, { title: '  ' })).rejects.toThrow('titulo');
    ptySessionManager.kill(session.id);
  });

  it('arquiva concluidas (uma e em lote) e o historico preserva tudo', async () => {
    const { workspace, session } = await createWorkspaceWithTerminal();

    const done1 = await taskBoardService.create(workspace.id, { title: 'Feita 1' });
    await taskBoardService.update(workspace.id, done1.id, { status: 'done' });
    const alive = await taskBoardService.create(workspace.id, { title: 'Viva 1' });

    // so da para arquivar tarefa concluida
    await expect(taskBoardService.archive(workspace.id, alive.id)).rejects.toThrow('concluida');

    const archived = await taskBoardService.archive(workspace.id, done1.id);
    expect(archived.archivedAt).toBeTruthy();

    // quadro esconde a arquivada; historico preserva (done + arquivadas)
    expect((await taskBoardService.list(workspace.id)).map((task) => task.id)).toEqual([alive.id]);
    expect((await taskBoardService.history(workspace.id)).map((task) => task.id)).toContain(done1.id);

    // arquivar em lote limpa a coluna Feito
    await taskBoardService.update(workspace.id, alive.id, { status: 'done' });
    const batch = await taskBoardService.archiveDone(workspace.id);
    expect(batch.archived).toBe(1);
    expect(await taskBoardService.list(workspace.id)).toHaveLength(0);
    expect(await taskBoardService.history(workspace.id)).toHaveLength(2);
    ptySessionManager.kill(session.id);
  });

  it('vinculo tarefa<->nota: arquivar esconde a nota, apagar a tarefa apaga a nota (1:N)', async () => {
    const { workspace, session } = await createWorkspaceWithTerminal();
    const note = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'note',
      title: 'Spec X',
      payload: { content: 'detalhes da spec' },
    });

    // vincula na criacao; id invalido falha
    const t1 = await taskBoardService.create(workspace.id, { title: 'T1', noteId: note.id });
    expect(t1.noteId).toBe(note.id);
    expect(t1.noteTitle).toBe('Spec X');
    await expect(taskBoardService.create(workspace.id, { title: 'T2', noteId: 'inexistente' })).rejects.toThrow('Nota');

    // nota vinculada NAO apaga pelo X do canvas (guard no deleteNode)
    await expect(workspaceService.deleteNode(workspace.id, note.id)).rejects.toThrow('vinculada');

    // segunda tarefa na MESMA nota (1:N): arquivar uma NAO esconde a nota
    const t2 = await taskBoardService.create(workspace.id, { title: 'T2', noteId: note.id });
    await taskBoardService.update(workspace.id, t1.id, { status: 'done' });
    await taskBoardService.archive(workspace.id, t1.id);
    expect((await workspaceRepository.listNodes(workspace.id)).some((node) => node.id === note.id)).toBe(true);

    // arquivando a ultima referencia, a nota sai do canvas (mas fica no banco)
    await taskBoardService.update(workspace.id, t2.id, { status: 'done' });
    await taskBoardService.archive(workspace.id, t2.id);
    expect((await workspaceRepository.listNodes(workspace.id)).some((node) => node.id === note.id)).toBe(false);
    expect((await workspaceRepository.listNodes(workspace.id, undefined, true)).some((node) => node.id === note.id)).toBe(true);

    // historico resolve o titulo mesmo com a nota arquivada
    const history = await taskBoardService.history(workspace.id);
    expect(history.find((task) => task.id === t1.id)?.noteTitle).toBe('Spec X');

    // apagar a tarefa apaga a nota JUNTO quando e a ultima referencia
    await taskBoardService.remove(workspace.id, t1.id);
    expect((await workspaceRepository.listNodes(workspace.id, undefined, true)).some((node) => node.id === note.id)).toBe(true);
    await taskBoardService.remove(workspace.id, t2.id);
    expect((await workspaceRepository.listNodes(workspace.id, undefined, true)).some((node) => node.id === note.id)).toBe(false);
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

  it('descricao em markdown na criacao e edicao da tarefa', async () => {
    const { workspace, session } = await createWorkspaceWithTerminal();

    const task = await taskBoardService.create(workspace.id, {
      title: 'Landing page',
      description: '## Escopo\n\n- [ ] hero\n- [ ] footer\n\nVeja [ref](https://exemplo.com).',
    });
    expect(task.description).toContain('- [ ] hero');

    const updated = await taskBoardService.update(workspace.id, task.id, { description: 'desc **nova**' });
    expect(updated.description).toBe('desc **nova**');

    const listed = await taskBoardService.list(workspace.id);
    expect(listed[0].description).toBe('desc **nova**');

    // limpar a descricao volta para null
    const cleared = await taskBoardService.update(workspace.id, task.id, { description: null });
    expect(cleared.description).toBeNull();
    ptySessionManager.kill(session.id);
  });

  it('task nova avisa o lider no terminal dele; task da ponte nao ecoa', async () => {
    const { workspace, leaderSession } = await createWorkspaceWithLeader();

    await taskBoardService.create(workspace.id, {
      title: 'Refinar hero',
      description: 'Seguir a hierarquia descrita no briefing.',
      images: ['.orkestrai/images/hero-a.png', '.orkestrai/images/hero-b.png'],
      createdBy: 'user',
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    let attached = ptySessionManager.attach(leaderSession.id, () => {});
    expect(attached.scrollback).toContain('nova tarefa no quadro');
    expect(attached.scrollback).toContain('Refinar hero');
    expect(attached.scrollback).toContain('Seguir a hierarquia descrita no briefing.');
    expect(attached.scrollback).toContain('.orkestrai/images/hero-a.png');
    expect(attached.scrollback).toContain('.orkestrai/images/hero-b.png');
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
