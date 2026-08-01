import { describe, expect, it } from 'vitest';
import { spawn } from 'node-pty';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { bridgeService } from '$lib/modules/agent-room/application/services/BridgeService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';

async function createWorkspaceWithTerminal() {
  const workspace = await workspaceRepository.createWorkspace({ name: 'bridge', workingDir: '/tmp' });
  const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
  const terminal = await workspaceRepository.createNode({
    workspaceId: workspace.id,
    type: 'terminal',
    title: 'Gato',
    payload: { command: '/bin/cat', sessionId: session.id },
  });
  return { workspace, terminal, session };
}

describe('BridgeService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('gera token por workspace, persiste e resolve por token', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'w', workingDir: '/tmp' });
    const token = await bridgeService.getOrCreateToken(workspace.id);
    expect(token).toHaveLength(48);

    const again = await bridgeService.getOrCreateToken(workspace.id);
    expect(again).toBe(token);

    const resolved = await bridgeService.resolveWorkspaceByToken(token);
    expect(resolved.id).toBe(workspace.id);

    await expect(bridgeService.resolveWorkspaceByToken('token-errado')).rejects.toThrow('invalido');
  });

  it('lista agentes do workspace com estado da sessao', async () => {
    const { workspace, terminal, session } = await createWorkspaceWithTerminal();
    const agents = await bridgeService.listAgents(workspace.id);
    expect(agents).toHaveLength(1);
    expect(agents[0].title).toBe('Gato');
    expect(agents[0].sessionAlive).toBe(true);
    ptySessionManager.kill(session.id);
    terminal.id && (await workspaceRepository.deleteNode(terminal.id));
  });

  it('ask envia mensagem ao PTY e retorna a resposta apos silencio', async () => {
    const { workspace, session } = await createWorkspaceWithTerminal();

    const result = await bridgeService.ask(workspace.id, {
      to: 'Gato',
      message: 'ping-ponte',
      timeoutMs: 15_000,
    });

    expect(result.to).toBe('Gato');
    expect(result.timedOut).toBe(false);
    expect(result.reply).toContain('ping-ponte');
    ptySessionManager.kill(session.id);
  });

  it('ask falha claro para agente inexistente', async () => {
    const { workspace, session } = await createWorkspaceWithTerminal();
    await expect(bridgeService.ask(workspace.id, { to: 'NaoExiste', message: 'oi' })).rejects.toThrow('nao encontrado');
    ptySessionManager.kill(session.id);
  });

  it('le, escreve e edita notas por substring', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'w', workingDir: '/tmp' });
    const note = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'note',
      payload: { content: 'versao 1 do plano' },
    });

    const read = await bridgeService.readNote(workspace.id, note.id);
    expect(read.content).toBe('versao 1 do plano');

    await bridgeService.writeNote(workspace.id, note.id, 'versao 2 do plano inteiro');
    expect((await bridgeService.readNote(workspace.id, note.id)).content).toContain('versao 2');

    await bridgeService.editNote(workspace.id, note.id, 'versao 2', 'versao 3');
    expect((await bridgeService.readNote(workspace.id, note.id)).content).toBe('versao 3 do plano inteiro');

    await expect(bridgeService.editNote(workspace.id, note.id, 'inexistente', 'x')).rejects.toThrow('nao encontrado');
  });

  it('notas conectadas a um agente via aresta', async () => {
    const { workspace, terminal, session } = await createWorkspaceWithTerminal();
    const note = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'note', payload: { content: '' } });
    const otherTerminal = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'terminal' });
    await workspaceRepository.createEdge({ workspaceId: workspace.id, sourceNodeId: terminal.id, targetNodeId: note.id });
    await workspaceRepository.createEdge({ workspaceId: workspace.id, sourceNodeId: otherTerminal.id, targetNodeId: note.id });

    expect(await bridgeService.notesForAgent(workspace.id, terminal.id)).toEqual([note.id]);
    ptySessionManager.kill(session.id);
  });
});

describe('Modo Maestro', () => {
  useSvelarTest({ refreshDatabase: true });

  async function setupMaestro(maestro: boolean) {
    const workspace = await workspaceRepository.createWorkspace({ name: 'maestro-ws', workingDir: '/tmp' });
    const leader = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Lider',
      payload: { command: 'claude', provider: 'claude', maestro },
    });
    return { workspace, leader };
  }

  it('recruta, conecta e dispensa com permissao de maestro', async () => {
    const { workspace, leader } = await setupMaestro(true);

    const recruited = await bridgeService.recruit(workspace.id, { from: 'Lider', title: 'Recruta', provider: 'kimi' });
    expect(recruited.title).toBe('Recruta');
    const nodes = await workspaceRepository.listNodes(workspace.id);
    expect(nodes).toHaveLength(2);
    const recrutaNode = nodes.find((node) => node.id === recruited.nodeId)!;
    expect((recrutaNode.payload as { command?: string }).command).toBe('kimi');

    const connection = await bridgeService.connectNodes(workspace.id, { from: 'Lider', to: 'Recruta' });
    expect(connection.from).toBe('Lider');
    expect(await workspaceRepository.listEdges(workspace.id)).toHaveLength(1);

    const dismissed = await bridgeService.dismiss(workspace.id, { from: 'Lider', target: 'Recruta' });
    expect(dismissed.dismissed).toBe('Recruta');
    expect(await workspaceRepository.listNodes(workspace.id)).toHaveLength(1);
    leader.id && expect((await workspaceRepository.listNodes(workspace.id))[0].id).toBe(leader.id);
  });

  it('bloqueia acoes sem Modo Maestro ativo', async () => {
    const { workspace } = await setupMaestro(false);
    await expect(bridgeService.recruit(workspace.id, { from: 'Lider', title: 'X' })).rejects.toThrow('Modo Maestro');
    await expect(bridgeService.connectNodes(workspace.id, { from: 'Lider', to: 'Lider' })).rejects.toThrow('Modo Maestro');
    await expect(bridgeService.dismiss(workspace.id, { from: 'Lider', target: 'Lider' })).rejects.toThrow('Modo Maestro');
  });

  it('maestro nao pode dispensar a si mesmo', async () => {
    const { workspace } = await setupMaestro(true);
    await expect(bridgeService.dismiss(workspace.id, { from: 'Lider', target: 'Lider' })).rejects.toThrow('si mesmo');
  });

  it('replace substitui recruta preservando o no', async () => {
    const { workspace } = await setupMaestro(true);
    const recruited = await bridgeService.recruit(workspace.id, { from: 'Lider', title: 'Recruta', provider: 'codex' });
    const replaced = await bridgeService.recruit(workspace.id, {
      from: 'Lider',
      title: 'Recruta',
      provider: 'claude',
      replace: 'Recruta',
    });
    expect(replaced.replaced).toBe(true);
    expect(replaced.nodeId).toBe(recruited.nodeId);
    const node = await workspaceRepository.getNode(recruited.nodeId);
    expect((node!.payload as { command?: string }).command).toBe('claude');
    expect((node!.payload as { sessionId?: string }).sessionId).toBeUndefined();
  });
});
