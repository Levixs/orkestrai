import { randomUUID } from 'node:crypto';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { agentSessionTracker } from '../../infrastructure/pty/AgentSessionTracker.js';
import { ptySessionManager } from '../../infrastructure/pty/PtySessionManager.js';
import { getAgentAdapter, hasAgentAdapter } from '../adapters/registry.js';
import { floorService } from './FloorService.js';
import { terminalExecutionRuntime } from '../../infrastructure/WslRuntime.js';
import type { WorkspaceExecutionRuntime } from '../../domain/types.js';

type AgentNodePayload = {
  sessionId?: string;
  agentSessionId?: string;
  resumeRecovery?: boolean;
  provider?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  executionRuntime?: WorkspaceExecutionRuntime | null;
};

export type EnsuredAgentSession = {
  nodeId: string;
  sessionId: string;
  state: 'existing' | 'started' | 'resumed';
};

function notifyWorkspaceChanged(workspaceId: string): void {
  const broadcast = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
  broadcast?.({ type: 'workspaceChanged', workspaceId });
}

export class AgentSessionService {
  async ensureByTitle(workspaceId: string, title: string): Promise<EnsuredAgentSession> {
    const nodes = await workspaceRepository.listNodes(workspaceId, undefined, true);
    const target = nodes.find((node) => node.type === 'terminal' && (node.title ?? '').trim() === title.trim());
    if (!target) throw new Error(`Agente "${title}" nao encontrado no canvas.`);
    return this.ensure(workspaceId, target.id);
  }

  async ensure(workspaceId: string, nodeId: string): Promise<EnsuredAgentSession> {
    const target = await workspaceRepository.getNode(nodeId);
    if (!target || target.workspaceId !== workspaceId || target.type !== 'terminal') {
      throw new Error('AGENT_NOT_FOUND');
    }
    const title = target.title ?? 'Terminal';
    const payload = (target.payload ?? {}) as AgentNodePayload;
    const existing = payload.sessionId ? ptySessionManager.get(payload.sessionId) : null;
    if (existing && !existing.exited) {
      return { nodeId: target.id, sessionId: existing.id, state: 'existing' };
    }
    if (!payload.command) throw new Error('AGENT_COMMAND_UNAVAILABLE');

    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    let cwd = workspace?.workingDir ?? '.';
    if (target.floorId) {
      const floor = await floorService.get(target.floorId);
      if (floor?.path) cwd = floor.path;
    }

    const adapter = payload.provider && hasAgentAdapter(payload.provider) ? getAgentAdapter(payload.provider) : null;
    const runtime = workspace ? terminalExecutionRuntime(workspace, payload) : { kind: 'native' as const };
    const trackingStartedAt = Date.now();
    const genericWslResumeArgs = runtime.kind === 'wsl'
      && !payload.agentSessionId
      && Boolean(payload.resumeRecovery || payload.sessionId)
      ? (adapter?.resumeArgs() ?? [])
      : [];
    const genericWslResume = genericWslResumeArgs.length > 0;
    const freshAgentSessionId = !genericWslResume && !payload.agentSessionId && adapter?.freshSessionArgs ? randomUUID() : null;
    const conversationArgs = payload.agentSessionId
      ? (adapter?.resumeArgs(payload.agentSessionId) ?? [])
      : genericWslResume
        ? genericWslResumeArgs
      : freshAgentSessionId
        ? adapter!.freshSessionArgs!(freshAgentSessionId)
        : [];
    if (freshAgentSessionId) agentSessionTracker.claim(freshAgentSessionId);

    const session = ptySessionManager.create({
      command: payload.command,
      args: [...(payload.args ?? []), ...conversationArgs],
      cwd,
      label: title,
      workspace: workspace?.name ?? null,
      workspaceId,
      nodeId: target.id,
      provider: payload.provider ?? null,
      env: { ...(payload.env ?? {}), ORKESTRAI_NODE_ID: target.id, ORKESTRAI_AGENT_TITLE: title },
      runtime,
      workspaceRoot: workspace?.workingDir,
    });
    const activeAgentSessionId = payload.agentSessionId ?? freshAgentSessionId;
    if (activeAgentSessionId) agentSessionTracker.bind(session.id, activeAgentSessionId);
    await workspaceRepository.updateNode(target.id, {
      payload: {
        ...payload,
        sessionId: session.id,
        resumeRecovery: false,
        ...(activeAgentSessionId ? { agentSessionId: activeAgentSessionId } : {}),
      } as never,
    });

    if (workspace?.runtimeKind !== 'wsl' && payload.provider && adapter && !activeAgentSessionId) {
      agentSessionTracker.watch(session.id, adapter.sessionStorage, cwd, trackingStartedAt, (agentSessionId) => {
        void workspaceRepository.getNode(target.id).then((fresh) => {
          if (!fresh) return;
          return workspaceRepository.updateNode(target.id, {
            payload: { ...((fresh.payload ?? {}) as object), sessionId: session.id, agentSessionId } as never,
          });
        }).then(() => notifyWorkspaceChanged(workspaceId)).catch(() => undefined);
      });
    }
    notifyWorkspaceChanged(workspaceId);
    return {
      nodeId: target.id,
      sessionId: session.id,
      state: payload.agentSessionId || genericWslResume ? 'resumed' : 'started',
    };
  }
}

export const agentSessionService = new AgentSessionService();
