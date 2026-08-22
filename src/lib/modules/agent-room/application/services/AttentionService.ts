import type {
  AgentActivity,
  AgentAttentionItem,
  AgentAttentionStatus,
  AgentActivitySeverity,
} from '../../domain/types.js';
import { attentionRepository } from '../../infrastructure/repositories/AttentionRepository.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';

const ATTENTION_STATES = new Set(['waiting_input', 'waiting_permission', 'blocked', 'error']);

function severityFor(activity: AgentActivity): AgentActivitySeverity {
  if (activity.severity !== 'info') return activity.severity;
  if (activity.state === 'error') return 'error';
  if (activity.state === 'blocked' || activity.state === 'waiting_permission') return 'warning';
  return 'info';
}

function broadcast(workspaceId: string, item?: AgentAttentionItem): void {
  const send = (globalThis as { __orkestraiBroadcast?: (frame: Record<string, unknown>) => void }).__orkestraiBroadcast;
  send?.({ type: 'attentionChanged', workspaceId, item });
}

export class AttentionService {
  async syncActivity(activity: AgentActivity): Promise<void> {
    const requiresAttention = activity.attentionRequired || ATTENTION_STATES.has(activity.state);
    if (!requiresAttention) {
      const resolved = await attentionRepository.resolveAgentState(activity.workspaceId, activity.nodeId);
      if (resolved) broadcast(activity.workspaceId);
      return;
    }
    const item = await attentionRepository.save({
      workspaceId: activity.workspaceId,
      activityEventId: activity.id,
      nodeId: activity.nodeId,
      taskId: activity.taskId,
      category: activity.category,
      severity: severityFor(activity),
      title: activity.objectTitle ?? activity.action ?? activity.verb,
      body: activity.outcome,
      sourceType: activity.sourceType ?? 'agent_state',
      sourceId: activity.sourceId ?? activity.nodeId,
      correlationId: activity.correlationId ?? `agent:${activity.nodeId}:${activity.category}`,
      action: {
        target: activity.taskId ? 'task' : 'node',
        workspaceId: activity.workspaceId,
        nodeId: activity.nodeId,
        taskId: activity.taskId,
      },
    });
    broadcast(activity.workspaceId, item);
  }

  async list(input: { workspaceId?: string | null; includeResolved?: boolean; limit?: number } = {}): Promise<AgentAttentionItem[]> {
    const items = await attentionRepository.list(input);
    const workspaces = await workspaceRepository.listWorkspaces();
    const workspaceNames = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
    const nodeIds = new Set(items.flatMap((item) => item.nodeId ? [item.nodeId] : []));
    const nodes = new Map<string, string>();
    await Promise.all([...nodeIds].map(async (nodeId) => {
      const node = await workspaceRepository.getNode(nodeId);
      if (node) nodes.set(nodeId, node.title ?? node.type);
    }));
    return items.map((item) => ({
      ...item,
      workspaceName: workspaceNames.get(item.workspaceId) ?? null,
      nodeTitle: item.nodeId ? nodes.get(item.nodeId) ?? null : null,
    }));
  }

  async setStatus(input: {
    id: string;
    workspaceId: string;
    status: AgentAttentionStatus;
    snoozedUntil?: string | null;
  }): Promise<AgentAttentionItem> {
    const item = await attentionRepository.updateStatus(input.id, input.workspaceId, input.status, input.snoozedUntil);
    if (!item) throw new Error('Attention item not found in this workspace.');
    broadcast(input.workspaceId, item);
    return item;
  }
}

export const attentionService = new AttentionService();
