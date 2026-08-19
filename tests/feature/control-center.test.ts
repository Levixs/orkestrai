import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { controlCenterService } from '$lib/modules/agent-room/application/services/ControlCenterService.js';
import { controlCenterRepository } from '$lib/modules/agent-room/infrastructure/repositories/ControlCenterRepository.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';
import { AgentFloor } from '$lib/modules/agent-room/domain/models/AgentFloor.js';
import { uuidv7 } from '@beeblock/svelar/support';

describe('ControlCenterService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('reduz eventos append-only no estado atual sem apagar o histórico', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'control', workingDir: '/tmp' });
    const agent = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Codex',
      payload: { provider: 'codex', role: 'Reviewer' },
    });

    await controlCenterService.recordActivity({
      workspaceId: workspace.id,
      nodeId: agent.id,
      state: 'working',
      action: 'system:task_working',
      taskId: '019c-task',
      metadata: { taskTitle: 'Review delivery' },
    });
    await controlCenterService.recordActivity({
      workspaceId: workspace.id,
      nodeId: agent.id,
      state: 'blocked',
      action: 'Waiting for API credentials',
      taskId: '019c-task',
    });

    const history = await controlCenterRepository.listActivity(workspace.id);
    const snapshot = await controlCenterService.snapshot(workspace.id);
    expect(history.map((event) => event.state)).toEqual(['working', 'blocked']);
    expect(snapshot.agents[0]).toMatchObject({
      nodeId: agent.id,
      state: 'disconnected',
      lastAction: 'Waiting for API credentials',
      sessionAlive: false,
    });
    expect(snapshot.counts.disconnected).toBe(1);
  });

  it('agrupa a trilha de entrega por messageId e conserva resposta confirmada', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'messages', workingDir: '/tmp' });
    const leader = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'terminal', title: 'Leader' });
    const worker = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'terminal', title: 'Worker' });
    const messageId = '019c-message';

    for (const state of ['queued', 'sent', 'delivered', 'acknowledged'] as const) {
      await controlCenterService.recordDelivery({
        messageId,
        workspaceId: workspace.id,
        fromNodeId: leader.id,
        toNodeId: worker.id,
        state,
        content: 'Review the change',
      });
    }
    await controlCenterService.recordDelivery({
      messageId,
      workspaceId: workspace.id,
      fromNodeId: leader.id,
      toNodeId: worker.id,
      state: 'replied',
      content: 'Review the change',
      reply: 'Reviewed and approved',
    });

    const [thread] = (await controlCenterService.snapshot(workspace.id)).communications;
    expect(thread).toMatchObject({
      messageId,
      fromTitle: 'Leader',
      toTitle: 'Worker',
      state: 'replied',
      reply: 'Reviewed and approved',
    });
    expect(thread.events.map((event) => event.state)).toEqual([
      'queued',
      'sent',
      'delivered',
      'acknowledged',
      'replied',
    ]);
  });

  it('reconstrói agentes desconectados sem criar ou acordar sessões PTY', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'restart', workingDir: '/tmp' });
    const agent = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'terminal', title: 'Idle agent' });
    await controlCenterService.recordActivity({
      workspaceId: workspace.id,
      nodeId: agent.id,
      state: 'idle',
      action: 'Waiting for work',
    });
    const sessionsBefore = ptySessionManager.list().length;

    const snapshot = await controlCenterService.snapshot(workspace.id);

    expect(ptySessionManager.list()).toHaveLength(sessionsBefore);
    expect(snapshot.agents[0].state).toBe('disconnected');
  });

  it('mostra o andar de agentes ativos e ignora registros de andares encerrados', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'floors', workingDir: '/tmp' });
    const floor = await AgentFloor.create({
      id: uuidv7(),
      workspace_id: workspace.id,
      name: 'Feature checkout',
      branch: 'orkestrai/feature-checkout',
      path: '/tmp/feature-checkout',
      status: 'active',
    });
    const agent = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      floorId: String(floor.getAttribute('id')),
      type: 'terminal',
      title: 'Frontend',
      payload: { provider: 'codex' },
    });

    expect((await controlCenterService.snapshot(workspace.id)).agents[0]).toMatchObject({
      nodeId: agent.id,
      floorId: floor.getAttribute('id'),
      floorName: 'Feature checkout',
    });

    await AgentFloor.query().where('id', floor.getAttribute('id')).update({ status: 'landed' });
    expect((await controlCenterService.snapshot(workspace.id)).agents).toEqual([]);
  });

  it('remove a telemetria antes de apagar o workspace', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'delete', workingDir: '/tmp' });
    const agent = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'terminal', title: 'Agent' });
    await controlCenterService.recordActivity({ workspaceId: workspace.id, nodeId: agent.id, state: 'idle' });
    await controlCenterService.recordDelivery({
      workspaceId: workspace.id,
      toNodeId: agent.id,
      state: 'queued',
      content: 'hello',
    });

    expect(await workspaceRepository.deleteWorkspace(workspace.id)).toBe(true);
    expect(await controlCenterRepository.listActivity(workspace.id)).toEqual([]);
    expect(await controlCenterRepository.listDeliveries(workspace.id)).toEqual([]);
  });
});
