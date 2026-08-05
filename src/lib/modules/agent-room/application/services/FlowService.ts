import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { bridgeService } from './BridgeService.js';

export type FlowStep = {
  kind: 'agent' | 'approval';
  /** Titulo do agente alvo (passo 'agent'). */
  target?: string;
  /** Template do prompt; {{input}} = saida do passo anterior. */
  prompt?: string;
};

export type FlowRunStep = {
  index: number;
  label: string;
  status: 'pending' | 'running' | 'waiting' | 'done' | 'error';
  excerpt?: string;
};

export type FlowRun = {
  active: boolean;
  iteration: number;
  iterations: number;
  startedAt: string;
  steps: FlowRunStep[];
};

export type FlowFinishedRun = {
  ok: boolean;
  error?: string;
  startedAt: string;
  finishedAt: string;
  steps: FlowRunStep[];
};

type RunHandle = { cancelled: boolean; onCancel?: () => void };

const MAX_ITERATIONS = 5;
const STEP_TIMEOUT_MS = 300_000;

/** Avisa o canvas para recarregar (progresso do fluxo aparece ao vivo). */
function notifyWorkspaceChanged(workspaceId: string) {
  const broadcast = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
  broadcast?.({ type: 'workspaceChanged', workspaceId });
}

/**
 * Flow runner: executa os passos de um no 'flow' em sequencia (DAG linear +
 * repeticao com limite). Passo 'agent' conversa com o agente via bridge ask
 * (as arestas acendem sozinhas); passo 'approval' pausa ate o humano aprovar.
 * O progresso e persistido no payload do no — sobrevive a reload e aparece
 * ao vivo no canvas.
 */
export class FlowService {
  private running = new Map<string, RunHandle>();
  private approvalWaiters = new Map<string, () => void>();

  async run(workspaceId: string, nodeId: string, input: string): Promise<{ started: boolean }> {
    const node = await workspaceRepository.getNode(nodeId);
    if (!node || node.workspaceId !== workspaceId || node.type !== 'flow') throw new Error('Fluxo nao encontrado neste workspace.');
    const payload = (node.payload ?? {}) as { steps?: FlowStep[]; iterations?: number };
    const steps = payload.steps ?? [];
    if (!steps.length) throw new Error('Adicione ao menos um passo ao fluxo.');
    for (const step of steps) {
      if (step.kind === 'agent' && !step.target?.trim()) throw new Error('Passo do tipo agente sem alvo.');
    }
    if (this.running.has(nodeId)) throw new Error('Este fluxo ja esta rodando.');

    const handle: RunHandle = { cancelled: false };
    this.running.set(nodeId, handle);
    void this.execute(workspaceId, nodeId, input, handle)
      .catch(() => {})
      .finally(() => this.running.delete(nodeId));
    return { started: true };
  }

  /** Aprova o passo 'approval' que esta esperando. */
  approve(workspaceId: string, nodeId: string): { approved: boolean } {
    void workspaceId;
    const waiter = this.approvalWaiters.get(nodeId);
    if (!waiter) throw new Error('Nenhum passo aguardando aprovacao neste fluxo.');
    this.approvalWaiters.delete(nodeId);
    waiter();
    return { approved: true };
  }

  /** Interrompe a execucao atual do fluxo. */
  stop(workspaceId: string, nodeId: string): { stopped: boolean } {
    void workspaceId;
    const handle = this.running.get(nodeId);
    if (!handle) throw new Error('Este fluxo nao esta rodando.');
    handle.cancelled = true;
    handle.onCancel?.();
    return { stopped: true };
  }

  isRunning(nodeId: string): boolean {
    return this.running.has(nodeId);
  }

  private async execute(workspaceId: string, nodeId: string, input: string, handle: RunHandle): Promise<void> {
    const startedAt = new Date().toISOString();
    const node = await workspaceRepository.getNode(nodeId);
    const payload = (node?.payload ?? {}) as { steps?: FlowStep[]; iterations?: number };
    const steps = payload.steps ?? [];
    const iterations = Math.min(MAX_ITERATIONS, Math.max(1, payload.iterations ?? 1));
    const runSteps: FlowRunStep[] = steps.map((step, index) => ({
      index,
      label: step.kind === 'approval' ? 'Aprovacao (voce)' : (step.target ?? '?'),
      status: 'pending',
    }));

    const persist = async (run: FlowRun | null) => {
      const fresh = await workspaceRepository.getNode(nodeId);
      if (!fresh) return;
      await workspaceRepository.updateNode(nodeId, { payload: { ...((fresh.payload ?? {}) as object), run } as never });
      notifyWorkspaceChanged(workspaceId);
    };

    let currentInput = input;
    let previousTarget: string | null = null;
    try {
      for (let iteration = 1; iteration <= iterations; iteration += 1) {
        for (let i = 0; i < steps.length; i += 1) {
          if (handle.cancelled) throw new Error('Fluxo interrompido pelo usuario.');
          const step = steps[i];
          runSteps[i] = { ...runSteps[i], status: step.kind === 'approval' ? 'waiting' : 'running' };
          await persist({ active: true, iteration, iterations, startedAt, steps: [...runSteps] });

          if (step.kind === 'approval') {
            await new Promise<void>((resolveApproval, rejectApproval) => {
              this.approvalWaiters.set(nodeId, resolveApproval);
              handle.onCancel = () => rejectApproval(new Error('Fluxo interrompido pelo usuario.'));
            });
            this.approvalWaiters.delete(nodeId);
            runSteps[i] = { ...runSteps[i], status: 'done', excerpt: 'aprovado' };
            await persist({ active: true, iteration, iterations, startedAt, steps: [...runSteps] });
            continue;
          }

          const message = (step.prompt?.trim() || '{{input}}').replaceAll('{{input}}', currentInput);
          const result = await bridgeService.ask(workspaceId, {
            to: step.target!,
            message,
            from: previousTarget,
            timeoutMs: STEP_TIMEOUT_MS,
          });
          currentInput = result.reply;
          previousTarget = step.target!;
          runSteps[i] = { ...runSteps[i], status: 'done', excerpt: result.reply.slice(0, 280) };
          await persist({ active: true, iteration, iterations, startedAt, steps: [...runSteps] });
        }
      }
      await this.finish(workspaceId, nodeId, { ok: true, startedAt, finishedAt: new Date().toISOString(), steps: runSteps });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha no fluxo.';
      const failedIndex = runSteps.findIndex((step) => step.status === 'running' || step.status === 'waiting');
      if (failedIndex >= 0) runSteps[failedIndex] = { ...runSteps[failedIndex], status: 'error', excerpt: message.slice(0, 280) };
      await this.finish(workspaceId, nodeId, {
        ok: false,
        error: message,
        startedAt,
        finishedAt: new Date().toISOString(),
        steps: runSteps,
      });
    }
  }

  /** Encerra a run: limpa o estado ativo e empilha no historico (ultimas 5). */
  private async finish(workspaceId: string, nodeId: string, run: FlowFinishedRun): Promise<void> {
    const fresh = await workspaceRepository.getNode(nodeId);
    if (!fresh) return;
    const payload = (fresh.payload ?? {}) as { runs?: FlowFinishedRun[] };
    const runs = [run, ...(payload.runs ?? [])].slice(0, 5);
    await workspaceRepository.updateNode(nodeId, { payload: { ...(fresh.payload as object), run: null, runs } as never });
    notifyWorkspaceChanged(workspaceId);
  }
}

export const flowService = new FlowService();
