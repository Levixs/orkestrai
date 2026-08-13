import { afterEach, describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { workspaceService } from '$lib/modules/agent-room/application/services/WorkspaceService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

/**
 * Mudancas estruturais (criar/remover no ou aresta) via servico — tours, CLI,
 * API — precisam avisar o canvas via broadcast, senao so aparecem ao recarregar.
 */
describe('WorkspaceService — broadcast de mudancas estruturais', () => {
  useSvelarTest({ refreshDatabase: true });

  const events: Array<Record<string, unknown>> = [];

  afterEach(() => {
    events.length = 0;
    delete (globalThis as { __orkestraiBroadcast?: unknown }).__orkestraiBroadcast;
    delete (globalThis as { __orkestraiStopWorkspaceDevice?: unknown }).__orkestraiStopWorkspaceDevice;
  });

  function capture() {
    (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast = (payload) => {
      events.push(payload);
    };
  }

  it('createNode, createEdge, deleteEdge e deleteNode emitem workspaceChanged', async () => {
    capture();
    const workspace = await workspaceRepository.createWorkspace({ name: 'broadcast', workingDir: '/tmp' });

    const dtoNode = { workspaceId: workspace.id, type: 'note', title: 'N', x: 0, y: 0, width: 200, height: 150, zIndex: undefined, payload: { content: '' } } as never;
    const created = await workspaceService.createNode(dtoNode);
    expect(events.at(-1)).toEqual({ type: 'workspaceChanged', workspaceId: workspace.id });

    const edge = await workspaceService.createEdge({ workspaceId: workspace.id, sourceNodeId: created.id, targetNodeId: created.id, style: 'cord' } as never);
    expect(events.at(-1)).toEqual({ type: 'workspaceChanged', workspaceId: workspace.id });

    await workspaceService.deleteEdge(workspace.id, edge.id);
    expect(events.at(-1)).toEqual({ type: 'workspaceChanged', workspaceId: workspace.id });

    await workspaceService.deleteNode(workspace.id, created.id);
    expect(events.at(-1)).toEqual({ type: 'workspaceChanged', workspaceId: workspace.id });
    expect(events).toHaveLength(4);
  });

  it('updateNode NAO emite (arrastar/redimensionar nao pode recarregar o canvas)', async () => {
    capture();
    const workspace = await workspaceRepository.createWorkspace({ name: 'broadcast2', workingDir: '/tmp' });
    const node = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'note', title: 'N', payload: {} });
    events.length = 0;
    await workspaceService.updateNode({ nodeId: node.id, changes: { x: 50 } } as never);
    expect(events).toHaveLength(0);
  });

  it('mantem um unico node device por workspace e encerra a sessao ao apagar', async () => {
    capture();
    const workspace = await workspaceRepository.createWorkspace({ name: 'device', workingDir: '/tmp' });
    const input = {
      workspaceId: workspace.id,
      type: 'device',
      title: 'Dispositivo móvel',
      x: 80,
      y: 80,
      width: 560,
      height: 720,
      zIndex: undefined,
      payload: {},
    } as never;

    const first = await workspaceService.createNode(input);
    const second = await workspaceService.createNode(input);
    expect(second.id).toBe(first.id);
    expect((await workspaceRepository.listNodes(workspace.id)).filter((node) => node.type === 'device')).toHaveLength(1);

    let stoppedWorkspaceId = '';
    (globalThis as { __orkestraiStopWorkspaceDevice?: (workspaceId: string) => Promise<void> }).__orkestraiStopWorkspaceDevice = async (workspaceId) => {
      stoppedWorkspaceId = workspaceId;
    };
    await workspaceService.deleteNode(workspace.id, first.id);
    expect(stoppedWorkspaceId).toBe(workspace.id);
  });
});
