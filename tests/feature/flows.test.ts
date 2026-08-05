import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { flowService } from '$lib/modules/agent-room/application/services/FlowService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';

async function createWorkspaceWithAgent() {
  const workspace = await workspaceRepository.createWorkspace({ name: 'flows', workingDir: '/tmp' });
  const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
  const agent = await workspaceRepository.createNode({
    workspaceId: workspace.id,
    type: 'terminal',
    title: 'Gato',
    payload: { command: '/bin/cat', provider: 'claude', sessionId: session.id },
  });
  return { workspace, agent, session };
}

async function runsOf(flowId: string) {
  const node = await workspaceRepository.getNode(flowId);
  return ((node?.payload ?? {}) as { runs?: unknown[] }).runs ?? [];
}

async function activeRun(flowId: string) {
  const node = await workspaceRepository.getNode(flowId);
  return ((node?.payload ?? {}) as { run?: { steps: Array<{ status: string }> } | null }).run ?? null;
}

describe('FlowService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('roda passo de agente em sequencia e registra o historico', async () => {
    const { workspace, session } = await createWorkspaceWithAgent();
    const flow = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'flow',
      title: 'F',
      payload: { steps: [{ kind: 'agent', target: 'Gato', prompt: 'ola {{input}}' }], iterations: 1 },
    });

    await flowService.run(workspace.id, flow.id, 'mundo');
    await expect.poll(() => runsOf(flow.id), { timeout: 20_000, interval: 500 }).toHaveLength(1);

    const runs = (await runsOf(flow.id)) as Array<{ ok: boolean; steps: Array<{ status: string; excerpt?: string }> }>;
    expect(runs[0].ok).toBe(true);
    expect(runs[0].steps[0].status).toBe('done');
    // /bin/cat ecoa: a "resposta" contem o prompt renderizado com o input.
    expect(runs[0].steps[0].excerpt).toContain('ola mundo');
    expect(await activeRun(flow.id)).toBeNull(); // estado ativo limpo ao fim
    ptySessionManager.kill(session.id);
  }, 30_000);

  it('passo de aprovacao pausa ate o humano aprovar', async () => {
    const { workspace, session } = await createWorkspaceWithAgent();
    const flow = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'flow',
      title: 'F2',
      payload: { steps: [{ kind: 'approval' }], iterations: 1 },
    });

    await flowService.run(workspace.id, flow.id, '');
    await expect.poll(async () => (await activeRun(flow.id))?.steps[0]?.status, { timeout: 10_000, interval: 300 }).toBe('waiting');

    // Segunda execucao em paralelo e recusada enquanto espera.
    await expect(flowService.run(workspace.id, flow.id, '')).rejects.toThrow('ja esta rodando');

    flowService.approve(workspace.id, flow.id);
    await expect.poll(() => runsOf(flow.id), { timeout: 10_000, interval: 300 }).toHaveLength(1);
    const runs = (await runsOf(flow.id)) as Array<{ ok: boolean }>;
    expect(runs[0].ok).toBe(true);
    ptySessionManager.kill(session.id);
  }, 30_000);

  it('stop interrompe e marca o passo como erro', async () => {
    const { workspace, session } = await createWorkspaceWithAgent();
    const flow = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'flow',
      title: 'F3',
      payload: { steps: [{ kind: 'approval' }], iterations: 1 },
    });

    await flowService.run(workspace.id, flow.id, '');
    await expect.poll(async () => (await activeRun(flow.id))?.steps[0]?.status, { timeout: 10_000, interval: 300 }).toBe('waiting');
    flowService.stop(workspace.id, flow.id);
    await expect.poll(() => runsOf(flow.id), { timeout: 10_000, interval: 300 }).toHaveLength(1);
    const runs = (await runsOf(flow.id)) as Array<{ ok: boolean; error?: string }>;
    expect(runs[0].ok).toBe(false);
    expect(runs[0].error).toContain('interrompido');
    ptySessionManager.kill(session.id);
  }, 30_000);

  it('validacoes: sem passos, passo sem alvo, no inexistente', async () => {
    const { workspace, session } = await createWorkspaceWithAgent();
    const empty = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'flow', title: 'Vazio', payload: { steps: [] } });
    await expect(flowService.run(workspace.id, empty.id, '')).rejects.toThrow('passo');
    const noTarget = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'flow', title: 'Sem alvo', payload: { steps: [{ kind: 'agent', prompt: 'x' }] } });
    await expect(flowService.run(workspace.id, noTarget.id, '')).rejects.toThrow('alvo');
    await expect(flowService.run(workspace.id, 'inexistente', '')).rejects.toThrow('nao encontrado');
    ptySessionManager.kill(session.id);
  });
});
