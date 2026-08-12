import { uuidv7 } from '@beeblock/svelar/support';
import type {
  AgentActivity,
  AgentActivityState,
  AgentMessageDeliveryEvent,
  AgentMessageDeliveryState,
} from '../../domain/types.js';
import { AgentActivityEvent } from '../../domain/models/AgentActivityEvent.js';
import { AgentMessageDelivery } from '../../domain/models/AgentMessageDelivery.js';

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mapActivity(model: AgentActivityEvent): AgentActivity {
  return {
    id: model.getAttribute('id'),
    workspaceId: model.getAttribute('workspace_id'),
    nodeId: model.getAttribute('node_id'),
    state: model.getAttribute('state') as AgentActivityState,
    action: model.getAttribute('action') ?? null,
    taskId: model.getAttribute('task_id') ?? null,
    metadata: parseMetadata(model.getAttribute('metadata_json')),
    createdAt: toIso(model.getAttribute('created_at')),
  };
}

function mapDelivery(model: AgentMessageDelivery): AgentMessageDeliveryEvent {
  return {
    id: model.getAttribute('id'),
    messageId: model.getAttribute('message_id'),
    workspaceId: model.getAttribute('workspace_id'),
    fromNodeId: model.getAttribute('from_node_id') ?? null,
    toNodeId: model.getAttribute('to_node_id'),
    state: model.getAttribute('state') as AgentMessageDeliveryState,
    content: model.getAttribute('content'),
    reply: model.getAttribute('reply') ?? null,
    error: model.getAttribute('error') ?? null,
    metadata: parseMetadata(model.getAttribute('metadata_json')),
    createdAt: toIso(model.getAttribute('created_at')),
  };
}

export class ControlCenterRepository {
  async appendActivity(input: {
    workspaceId: string;
    nodeId: string;
    state: AgentActivityState;
    action?: string | null;
    taskId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AgentActivity> {
    const model = await AgentActivityEvent.create({
      id: uuidv7(),
      workspace_id: input.workspaceId,
      node_id: input.nodeId,
      state: input.state,
      action: input.action ?? null,
      task_id: input.taskId ?? null,
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      created_at: new Date().toISOString(),
    });
    return mapActivity(model);
  }

  async listActivity(workspaceId: string, limit = 5_000): Promise<AgentActivity[]> {
    const rows = await AgentActivityEvent.query()
      .where('workspace_id', workspaceId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();
    return rows.reverse().map(mapActivity);
  }

  async latestActivity(nodeId: string): Promise<AgentActivity | null> {
    const model = await AgentActivityEvent.query()
      .where('node_id', nodeId)
      .orderBy('created_at', 'desc')
      .first();
    return model ? mapActivity(model) : null;
  }

  async appendDelivery(input: {
    messageId: string;
    workspaceId: string;
    fromNodeId?: string | null;
    toNodeId: string;
    state: AgentMessageDeliveryState;
    content: string;
    reply?: string | null;
    error?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AgentMessageDeliveryEvent> {
    const model = await AgentMessageDelivery.create({
      id: uuidv7(),
      message_id: input.messageId,
      workspace_id: input.workspaceId,
      from_node_id: input.fromNodeId ?? null,
      to_node_id: input.toNodeId,
      state: input.state,
      content: input.content,
      reply: input.reply ?? null,
      error: input.error ?? null,
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      created_at: new Date().toISOString(),
    });
    return mapDelivery(model);
  }

  async listDeliveries(workspaceId: string, limit = 1_200): Promise<AgentMessageDeliveryEvent[]> {
    const rows = await AgentMessageDelivery.query()
      .where('workspace_id', workspaceId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();
    return rows.reverse().map(mapDelivery);
  }

  async deleteWorkspaceHistory(workspaceId: string): Promise<void> {
    await AgentMessageDelivery.query().where('workspace_id', workspaceId).delete();
    await AgentActivityEvent.query().where('workspace_id', workspaceId).delete();
  }
}

export const controlCenterRepository = new ControlCenterRepository();
