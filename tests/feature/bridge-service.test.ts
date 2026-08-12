import { describe, expect, it } from 'vitest';
import { spawn } from 'node-pty';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { bridgeService } from '$lib/modules/agent-room/application/services/BridgeService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';
import { controlCenterService } from '$lib/modules/agent-room/application/services/ControlCenterService.js';

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

    await expect(bridgeService.resolveWorkspaceByToken('token-errado')).rejects.toThrow('inválido');
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
    expect(result.delivered).toBe(true);
    expect(result.replyConfirmed).toBe(true);
    expect(result.reply).toContain('ping-ponte');
    expect(result.messageId).toBeTruthy();
    expect(result.deliveryState).toBe('replied');
    expect((await controlCenterService.snapshot(workspace.id)).communications[0].events.map((event) => event.state)).toEqual([
      'queued',
      'sent',
      'delivered',
      'acknowledged',
      'replied',
    ]);
    ptySessionManager.kill(session.id);
  });

  it('ask funciona nos dois sentidos entre terminais Claude e Codex', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'duplex', workingDir: '/tmp' });
    const claudeSession = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    const codexSession = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Claude',
      payload: { command: '/bin/cat', sessionId: claudeSession.id, maestro: true },
    });
    await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Codex',
      payload: { command: '/bin/cat', sessionId: codexSession.id },
    });

    const toCodex = await bridgeService.ask(workspace.id, { to: 'Codex', from: 'Claude', message: 'claude-para-codex', timeoutMs: 15_000 });
    const toClaude = await bridgeService.ask(workspace.id, { to: 'Claude', from: 'Codex', message: 'codex-para-claude', timeoutMs: 15_000 });
    expect(toCodex).toMatchObject({ delivered: true, replyConfirmed: true, timedOut: false });
    expect(toCodex.reply).toContain('claude-para-codex');
    expect(toClaude).toMatchObject({ delivered: true, replyConfirmed: true, timedOut: false });
    expect(toClaude.reply).toContain('codex-para-claude');

    ptySessionManager.kill(claudeSession.id);
    ptySessionManager.kill(codexSession.id);
  }, 20_000);

  it('ask falha claro para agente inexistente', async () => {
    const { workspace, session } = await createWorkspaceWithTerminal();
    await expect(bridgeService.ask(workspace.id, { to: 'NaoExiste', message: 'oi' })).rejects.toThrow('não encontrado');
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

    await expect(bridgeService.editNote(workspace.id, note.id, 'inexistente', 'x')).rejects.toThrow('não encontrado');
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
    expect((node!.payload as { provider?: string }).provider).toBe('claude');
    expect((node!.payload as { sessionId?: string; agentSessionId?: string }).sessionId).toBeUndefined();
    expect((node!.payload as { agentSessionId?: string }).agentSessionId).toBeUndefined();
  });

  it('rejeita provider desconhecido em vez de criar um shell sem agente', async () => {
    const { workspace } = await setupMaestro(true);
    await expect(
      bridgeService.recruit(workspace.id, { from: 'Lider', title: 'Invalido', provider: 'nao-existe' })
    ).rejects.toThrow('Provider desconhecido');
  });

  it('recruta nasce conectado ao maestro e com titulo curto', async () => {
    const { workspace, leader } = await setupMaestro(true);
    const longTitle = 'Arquiteto frontend scaffold Vite+ReactTS, estrutura de pastas, estado global, integracao final do time';
    const recruited = await bridgeService.recruit(workspace.id, { from: 'Lider', title: longTitle, provider: 'kimi' });

    expect(recruited.title!.length).toBeLessThanOrEqual(48);
    expect(recruited.title).toContain('…');

    const edges = await workspaceRepository.listEdges(workspace.id);
    expect(edges).toHaveLength(1);
    expect([edges[0].sourceNodeId, edges[0].targetNodeId].sort()).toEqual([leader.id, recruited.nodeId].sort());
  });

  it('nota com --connect all conecta a todos os agentes', async () => {
    const { workspace } = await setupMaestro(true);
    await bridgeService.recruit(workspace.id, { from: 'Lider', title: 'A1', provider: 'kimi' });
    await bridgeService.recruit(workspace.id, { from: 'Lider', title: 'A2', provider: 'codex' });

    const note = await bridgeService.createNote(workspace.id, { title: 'Spec', content: 'x', connect: 'all' });
    expect(note.connectedTo).toBe('todos os agentes');
    // 2 edges do recruit + 3 da nota (lider + 2 recrutas)
    expect(await workspaceRepository.listEdges(workspace.id)).toHaveLength(2 + 3);
  });

  it('quadro de tarefas aparece sozinho na primeira tarefa (idempotente)', async () => {
    const { workspace } = await setupMaestro(true);
    expect((await workspaceRepository.listNodes(workspace.id)).some((node) => node.type === 'tasks')).toBe(false);

    await bridgeService.ensureTasksBoard(workspace.id);
    await bridgeService.ensureTasksBoard(workspace.id);

    const nodes = await workspaceRepository.listNodes(workspace.id);
    expect(nodes.filter((node) => node.type === 'tasks')).toHaveLength(1);
  });

  it('portal create exige maestro, cria no com url e conecta', async () => {
    const { workspace, leader } = await setupMaestro(true);
    const portal = await bridgeService.createPortal(workspace.id, { from: 'Lider', url: 'localhost:5173' });
    expect(portal.url).toBe('http://localhost:5173');
    expect(portal.connectedTo).toBe('Lider');

    const node = await workspaceRepository.getNode(portal.nodeId);
    expect(node!.type).toBe('portal');
    expect((node!.payload as { url?: string }).url).toBe('http://localhost:5173');

    const edges = await workspaceRepository.listEdges(workspace.id);
    expect(edges).toHaveLength(1);
    expect([edges[0].sourceNodeId, edges[0].targetNodeId].sort()).toEqual([leader.id, portal.nodeId].sort());
  });

  it('ask cria aresta entre os agentes que conversam', async () => {
    const { workspace, leader } = await setupMaestro(true);
    const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    await workspaceRepository.updateNode(leader.id, { payload: { command: 'claude', provider: 'claude', maestro: true, sessionId: session.id } });
    const recruited = await bridgeService.recruit(workspace.id, { from: 'Lider', title: 'Recruta', provider: 'kimi' });
    const sessionB = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    await workspaceRepository.updateNode(recruited.nodeId, { payload: { command: 'kimi', provider: 'kimi', sessionId: sessionB.id } });

    const before = await workspaceRepository.listEdges(workspace.id);
    await bridgeService.ask(workspace.id, { to: 'Recruta', message: 'ping', from: 'Lider', timeoutMs: 15_000 });
    const after = await workspaceRepository.listEdges(workspace.id);

    expect(after.length).toBe(before.length); // aresta do recruit ja cobre o par (dedup)
    expect(after.some((edge) => [edge.sourceNodeId, edge.targetNodeId].includes(recruited.nodeId))).toBe(true);
    ptySessionManager.kill(session.id);
    ptySessionManager.kill(sessionB.id);
  });
});

describe('titulos de agente (roteamento do ask)', () => {
  useSvelarTest({ refreshDatabase: true });

  it('ask com titulo duplicado falha com orientacao clara', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'dup', workingDir: '/tmp' });
    for (const title of ['Claude', 'Claude']) {
      const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
      await workspaceRepository.createNode({
        workspaceId: workspace.id,
        type: 'terminal',
        title,
        payload: { command: '/bin/cat', provider: 'claude', sessionId: session.id },
      });
    }
    await expect(bridgeService.ask(workspace.id, { to: 'Claude', message: 'oi' })).rejects.toThrow('agentes chamados');
    // limpa as sessoes criadas no loop
    const nodes = await workspaceRepository.listNodes(workspace.id);
    for (const node of nodes) {
      const sessionId = (node.payload as { sessionId?: string }).sessionId;
      if (sessionId) ptySessionManager.kill(sessionId);
    }
  });

  it('recruit gera titulo unico automaticamente', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'uniq', workingDir: '/tmp' });
    await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Lider',
      payload: { command: 'claude', provider: 'claude', maestro: true },
    });
    const first = await bridgeService.recruit(workspace.id, { from: 'Lider', title: 'Dev', provider: 'kimi' });
    const second = await bridgeService.recruit(workspace.id, { from: 'Lider', title: 'Dev', provider: 'kimi' });
    expect(first.title).toBe('Dev');
    expect(second.title).toBe('Dev 2');
  });
});
