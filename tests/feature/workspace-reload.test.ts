import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { workspaceService } from '$lib/modules/agent-room/application/services/WorkspaceService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';
import { getAgentAdapter } from '$lib/modules/agent-room/application/adapters/registry.js';
import { agentSessionTracker } from '$lib/modules/agent-room/infrastructure/pty/AgentSessionTracker.ts';

describe('WorkspaceService.reloadNode', () => {
  useSvelarTest({ refreshDatabase: true });
  afterEach(() => vi.restoreAllMocks());

  it('mata a sessao PTY e limpa o sessionId, mantendo o agentSessionId (resume)', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'reload', workingDir: '/tmp' });
    const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    const node = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'T',
      payload: { command: '/bin/cat', sessionId: session.id, agentSessionId: 'sess-real-123', provider: 'claude' },
    });

    await workspaceService.reloadNode(workspace.id, node.id);

    const after = await workspaceRepository.getNode(node.id);
    const payload = (after!.payload ?? {}) as Record<string, unknown>;
    expect(payload.sessionId).toBeUndefined();
    expect(payload.agentSessionId).toBe('sess-real-123');
    expect(ptySessionManager.get(session.id)?.exited).not.toBe(false);
  });

  it('falha com no inexistente ou de outro workspace', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'reload2', workingDir: '/tmp' });
    await expect(workspaceService.reloadNode(workspace.id, 'inexistente')).rejects.toThrow('nao encontrado');
  });

  it('repara terminais antigos de presets com o acesso total do adapter', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'preset antigo', workingDir: '/tmp' });
    const node = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Claude',
      payload: { command: 'claude', args: [], provider: 'claude' },
    });

    const nodes = await workspaceService.listNodes(workspace.id);
    const payload = nodes.find((item) => item.id === node.id)!.payload as { args?: string[] };
    expect(payload.args).toContain('--dangerously-skip-permissions');

    const persisted = (await workspaceRepository.getNode(node.id))!.payload as { args?: string[] };
    expect(persisted.args).toContain('--dangerously-skip-permissions');
  });

  it('remove sessionId obsoleto no restart e preserva a conversa do provider', async () => {
    vi.spyOn(agentSessionTracker, 'isAgentSessionResumable').mockReturnValue(true);
    const workspace = await workspaceRepository.createWorkspace({ name: 'restart', workingDir: '/tmp' });
    const node = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Claude',
      payload: {
        command: 'claude',
        args: ['--dangerously-skip-permissions'],
        provider: 'claude',
        sessionId: 'pty-do-processo-anterior',
        agentSessionId: 'conversa-real-123',
      },
    });

    const listed = await workspaceService.listNodes(workspace.id);
    const payload = listed.find((item) => item.id === node.id)!.payload as Record<string, unknown>;
    expect(payload.sessionId).toBeUndefined();
    expect(payload.agentSessionId).toBe('conversa-real-123');

    const persisted = (await workspaceRepository.getNode(node.id))!.payload as Record<string, unknown>;
    expect(persisted.sessionId).toBeUndefined();
    expect(persisted.agentSessionId).toBe('conversa-real-123');
  });

  it('recupera conversa Claude ausente sem tentar resume nem reinjetar role', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'recovery', workingDir: '/tmp' });
    const node = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Claude',
      payload: {
        command: 'claude',
        provider: 'claude',
        sessionId: 'pty-antiga',
        agentSessionId: 'conversa-inexistente',
        role: 'Lider',
      },
    });
    vi.spyOn(agentSessionTracker, 'isAgentSessionResumable').mockReturnValue(false);

    const listed = await workspaceService.listNodes(workspace.id);
    const payload = listed.find((item) => item.id === node.id)!.payload as Record<string, unknown>;

    expect(payload.sessionId).toBeUndefined();
    expect(payload.agentSessionId).toBeUndefined();
    expect(payload.resumeRecovery).toBe(true);
    expect(payload.role).toBe('Lider');
  });

  it('troca o provider e preserva a identidade organizacional do terminal', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'troca provider', workingDir: '/tmp' });
    const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    const node = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Arquiteto',
      x: 345,
      y: 678,
      payload: {
        command: 'claude',
        args: ['--dangerously-skip-permissions'],
        provider: 'claude',
        sessionId: session.id,
        agentSessionId: 'claude-session',
        role: 'Arquiteto',
        maestro: true,
        floorId: 'floor-1',
        theme: 'emerald',
      },
    });
    vi.spyOn(getAgentAdapter('codex'), 'detect').mockResolvedValue({ installed: true, detail: 'test' });

    const changed = await workspaceService.changeTerminalProvider({
      workspaceId: workspace.id,
      nodeId: node.id,
      provider: 'codex',
    });
    const payload = changed!.payload as Record<string, unknown>;

    expect(payload.provider).toBe('codex');
    expect(payload.command).toBe('codex');
    expect(payload.args).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(payload.sessionId).toBeUndefined();
    expect(payload.agentSessionId).toBeUndefined();
    expect(payload).toMatchObject({ role: 'Arquiteto', maestro: true, floorId: 'floor-1', theme: 'emerald' });
    expect(changed).toMatchObject({ title: 'Arquiteto', x: 345, y: 678 });
    expect(ptySessionManager.get(session.id)?.exited).not.toBe(false);
  });
});
