import { uuidv7 } from '@beeblock/svelar/support';
import type { Routine } from '../../domain/types.js';
import { AgentRoutine } from '../../domain/models/AgentRoutine.js';
import { AgentRoutineRun } from '../../domain/models/AgentRoutineRun.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '../../infrastructure/pty/PtySessionManager.ts';

const TICK_MS = 15_000;

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapRoutine(model: AgentRoutine): Routine {
  return {
    id: model.getAttribute('id'),
    workspaceId: model.getAttribute('workspace_id'),
    targetNodeId: model.getAttribute('target_node_id'),
    prompt: model.getAttribute('prompt'),
    intervalMinutes: model.getAttribute('interval_minutes'),
    enabled: Boolean(model.getAttribute('enabled')),
    lastRunAt: model.getAttribute('last_run_at') ? toIso(model.getAttribute('last_run_at')) : null,
    runCount: model.getAttribute('run_count'),
    createdAt: toIso(model.getAttribute('created_at')),
  };
}

/**
 * Rotinas: prompts agendados disparados a terminais do workspace.
 * Multiplas etapas: linhas começando com `&&` sao enviadas em sequencia.
 * O scheduler roda em processo (tick a cada 15s) e dispara as rotinas devidas.
 */
export class RoutineService {
  private timer: ReturnType<typeof setInterval> | null = null;

  async list(workspaceId: string): Promise<Routine[]> {
    const rows = await AgentRoutine.query().where('workspace_id', workspaceId).orderBy('created_at', 'asc').get();
    return rows.map(mapRoutine);
  }

  async create(input: {
    workspaceId: string;
    targetNodeId: string;
    prompt: string;
    intervalMinutes?: number | null;
  }): Promise<Routine> {
    if (!input.prompt.trim()) throw new Error('Informe o prompt da rotina.');
    const node = await workspaceRepository.getNode(input.targetNodeId);
    if (!node || node.workspaceId !== input.workspaceId || node.type !== 'terminal') {
      throw new Error('Alvo da rotina precisa ser um terminal deste workspace.');
    }
    const model = await AgentRoutine.create({
      id: uuidv7(),
      workspace_id: input.workspaceId,
      target_node_id: input.targetNodeId,
      prompt: input.prompt.trim(),
      interval_minutes: input.intervalMinutes ?? null,
      enabled: true,
      last_run_at: null,
      run_count: 0,
      created_at: new Date(),
    });
    return mapRoutine(model);
  }

  async setEnabled(id: string, enabled: boolean): Promise<Routine | null> {
    await AgentRoutine.query().where('id', id).update({ enabled });
    const model = await AgentRoutine.find(id);
    return model ? mapRoutine(model) : null;
  }

  async update(id: string, input: { targetNodeId?: string; prompt?: string; intervalMinutes?: number | null }): Promise<Routine | null> {
    const existing = await AgentRoutine.find(id);
    if (!existing) return null;
    const patch: Record<string, unknown> = {};
    if (input.prompt !== undefined) {
      if (!input.prompt.trim()) throw new Error('Informe o prompt da rotina.');
      patch.prompt = input.prompt.trim();
    }
    if (input.intervalMinutes !== undefined) patch.interval_minutes = input.intervalMinutes;
    if (input.targetNodeId !== undefined) {
      const node = await workspaceRepository.getNode(input.targetNodeId);
      if (!node || node.workspaceId !== existing.getAttribute('workspace_id') || node.type !== 'terminal') {
        throw new Error('Alvo da rotina precisa ser um terminal deste workspace.');
      }
      patch.target_node_id = input.targetNodeId;
    }
    await AgentRoutine.query().where('id', id).update(patch);
    const model = await AgentRoutine.find(id);
    return model ? mapRoutine(model) : null;
  }

  async remove(id: string): Promise<boolean> {
    await AgentRoutineRun.query().where('routine_id', id).delete();
    const deleted = await AgentRoutine.query().where('id', id).delete();
    return deleted > 0;
  }

  async history(id: string, limit = 20) {
    const rows = await AgentRoutineRun.query().where('routine_id', id).orderBy('ran_at', 'desc').limit(limit).get();
    return rows.map((row) => ({
      id: row.getAttribute('id'),
      ranAt: toIso(row.getAttribute('ran_at')),
      ok: Boolean(row.getAttribute('ok')),
      detail: row.getAttribute('detail'),
    }));
  }

  /** Dispara uma rotina agora (envia o prompt ao PTY do alvo, etapa a etapa). */
  async runNow(id: string): Promise<{ ok: boolean; detail: string }> {
    const model = await AgentRoutine.find(id);
    if (!model) throw new Error('Rotina nao encontrada.');
    const routine = mapRoutine(model);

    const node = await workspaceRepository.getNode(routine.targetNodeId);
    const sessionId = (node?.payload as { sessionId?: string } | undefined)?.sessionId;
    const session = sessionId ? ptySessionManager.get(sessionId) : null;

    let ok = true;
    let detail = '';
    try {
      if (!sessionId || !session || session.exited) {
        throw new Error('O terminal alvo nao tem sessao PTY ativa.');
      }
      const steps = routine.prompt
        .split('\n')
        .map((line) => line.replace(/^&&\s*/, '').trim())
        .filter(Boolean);
      for (const step of steps) {
        // Texto e Enter em writes separados (TUIs como o Codex tratam o \r
        // colado como quebra de linha no composer em vez de submit).
        ptySessionManager.write(sessionId, step);
        await new Promise((resolve) => setTimeout(resolve, 120));
        ptySessionManager.write(sessionId, '\r');
        // Pequeno intervalo entre etapas para o agente processar
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      detail = `${steps.length} etapa(s) enviadas para ${node?.title ?? 'terminal'}.`;
    } catch (error) {
      ok = false;
      detail = error instanceof Error ? error.message : String(error);
    }

    await AgentRoutineRun.create({ id: uuidv7(), routine_id: id, ran_at: new Date(), ok, detail });
    await AgentRoutine.query()
      .where('id', id)
      .update({ last_run_at: new Date(), run_count: routine.runCount + 1 });

    // Rotina de execucao unica se desativa apos rodar
    if (!routine.intervalMinutes) {
      await AgentRoutine.query().where('id', id).update({ enabled: false });
    }

    return { ok, detail };
  }

  /** Rotinas devidas agora (habilitadas, intervalo vencido ou nunca rodadas com >1min de criacao). */
  async dueRoutines(): Promise<Routine[]> {
    const rows = await AgentRoutine.query().where('enabled', true).get();
    const now = Date.now();
    return rows.map(mapRoutine).filter((routine) => {
      if (!routine.intervalMinutes) {
        // execucao unica: dispara 1 min apos criacao se ainda nao rodou
        return !routine.lastRunAt && now - new Date(routine.createdAt).getTime() > 60_000;
      }
      if (!routine.lastRunAt) return true;
      return now - new Date(routine.lastRunAt).getTime() >= routine.intervalMinutes * 60_000;
    });
  }

  async tick() {
    const due = await this.dueRoutines();
    for (const routine of due) {
      await this.runNow(routine.id).catch(() => {});
    }
    return due.length;
  }

  startScheduler() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch(() => {});
    }, TICK_MS);
    this.timer.unref?.();
  }

  stopScheduler() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export const routineService = new RoutineService();
