import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { workspaceService } from '$lib/modules/agent-room/application/services/WorkspaceService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';

describe('WorkspaceService.reloadNode', () => {
  useSvelarTest({ refreshDatabase: true });

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
});
