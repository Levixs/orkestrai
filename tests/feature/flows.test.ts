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

  it('spawna a sessao do agente sozinho quando o terminal nunca foi aberto', async () => {
    // Terminal SEM sessionId (nunca aberto no canvas): o fluxo spawna no
    // servidor, persiste o sessionId no payload e conclui mesmo assim.
    const workspace = await workspaceRepository.createWorkspace({ name: 'flows-spawn', workingDir: '/tmp' });
    const agent = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Dorminhoco',
      payload: { command: '/bin/cat' },
    });
    const flow = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'flow',
      title: 'F4',
      payload: { steps: [{ kind: 'agent', target: 'Dorminhoco', prompt: 'acorda {{input}}' }], iterations: 1 },
    });

    await flowService.run(workspace.id, flow.id, 'ai');
    await expect.poll(() => runsOf(flow.id), { timeout: 20_000, interval: 500 }).toHaveLength(1);

    const runs = (await runsOf(flow.id)) as Array<{ ok: boolean; steps: Array<{ status: string; excerpt?: string }> }>;
    expect(runs[0].ok).toBe(true);
    expect(runs[0].steps[0].excerpt).toContain('acorda ai');

    // sessionId persistido no payload e sessao viva no gerenciador
    const updated = await workspaceRepository.getNode(agent.id);
    const sessionId = (updated?.payload as { sessionId?: string }).sessionId;
    expect(sessionId).toBeTruthy();
    expect(ptySessionManager.get(sessionId!)?.exited).toBe(false);
    ptySessionManager.kill(sessionId!);
  }, 30_000);

  it('encadeia fluxos conectados: a saida de um dispara o proximo', async () => {
    const { workspace, session } = await createWorkspaceWithAgent();
    const flowA = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'flow',
      title: 'A',
      payload: { steps: [{ kind: 'agent', target: 'Gato', prompt: 'etapa A: {{input}}' }], iterations: 1 },
    });
    const flowB = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'flow',
      title: 'B',
      payload: { steps: [{ kind: 'agent', target: 'Gato', prompt: 'etapa B: {{input}}' }], iterations: 1 },
    });
    await workspaceRepository.createEdge({ workspaceId: workspace.id, sourceNodeId: flowA.id, targetNodeId: flowB.id });

    await flowService.run(workspace.id, flowA.id, 'inicio');
    // A termina e dispara B automaticamente com a saida final de A
    await expect.poll(() => runsOf(flowB.id), { timeout: 30_000, interval: 500 }).toHaveLength(1);

    const runsA = (await runsOf(flowA.id)) as Array<{ ok: boolean }>;
    const runsB = (await runsOf(flowB.id)) as Array<{ ok: boolean; steps: Array<{ excerpt?: string }> }>;
    expect(runsA[0].ok).toBe(true);
    expect(runsB[0].ok).toBe(true);
    // B recebeu a saida de A como entrada (o /bin/cat ecoa o prompt renderizado)
    expect(runsB[0].steps[0].excerpt).toContain('etapa B:');
    expect(runsB[0].steps[0].excerpt).toContain('etapa A: inicio');
    ptySessionManager.kill(session.id);
  }, 45_000);

  it('ciclo A<->B nao entra em loop infinito: cada um roda uma vez', async () => {
    const { workspace, session } = await createWorkspaceWithAgent();
    const flowA = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'flow',
      title: 'A',
      payload: { steps: [{ kind: 'agent', target: 'Gato', prompt: 'A {{input}}' }], iterations: 1 },
    });
    const flowB = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'flow',
      title: 'B',
      payload: { steps: [{ kind: 'agent', target: 'Gato', prompt: 'B {{input}}' }], iterations: 1 },
    });
    await workspaceRepository.createEdge({ workspaceId: workspace.id, sourceNodeId: flowA.id, targetNodeId: flowB.id });

    await flowService.run(workspace.id, flowA.id, 'x');
    await expect.poll(() => runsOf(flowB.id), { timeout: 30_000, interval: 500 }).toHaveLength(1);
    // Espera mais um pouco: B NAO pode ter re-disparado A (visited) nem se repetido
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    expect(await runsOf(flowA.id)).toHaveLength(1);
    expect(await runsOf(flowB.id)).toHaveLength(1);
    ptySessionManager.kill(session.id);
  }, 60_000);

  it('fluxo que falha NAO encadeia para o proximo', async () => {
    const { workspace, session } = await createWorkspaceWithAgent();
    const flowA = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'flow',
      title: 'A',
      payload: { steps: [{ kind: 'agent', target: 'Inexistente', prompt: 'x' }], iterations: 1 },
    });
    const flowB = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'flow',
      title: 'B',
      payload: { steps: [{ kind: 'agent', target: 'Gato', prompt: 'B {{input}}' }], iterations: 1 },
    });
    await workspaceRepository.createEdge({ workspaceId: workspace.id, sourceNodeId: flowA.id, targetNodeId: flowB.id });

    await flowService.run(workspace.id, flowA.id, 'x');
    await expect.poll(() => runsOf(flowA.id), { timeout: 15_000, interval: 300 }).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    expect(await runsOf(flowB.id)).toHaveLength(0);
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
