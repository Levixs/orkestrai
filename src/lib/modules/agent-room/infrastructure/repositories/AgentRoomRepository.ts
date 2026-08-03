import { uuidv7 } from '@beeblock/svelar/support';
import type {
  AgentName,
  AgentTask,
  ChatMessage,
  Conversation,
  ConversationMode,
  ModelEffort,
  TaskEvent,
  TaskStatus,
  TeamMember,
  TeamMemberCapability,
  TeamMemberRole,
} from '../../domain/types.js';
import { AgentConversation } from '../../domain/models/AgentConversation.js';
import { AgentMessage } from '../../domain/models/AgentMessage.js';
import { AgentRun } from '../../domain/models/AgentRun.js';
import { AgentTeamMember } from '../../domain/models/AgentTeamMember.js';
import { AgentTask as AgentTaskModel } from '../../domain/models/AgentTask.js';
import { AgentTaskEvent } from '../../domain/models/AgentTaskEvent.js';

type AgentRunInput = {
  id: string;
  conversationId: string;
  agent: AgentName;
  memberId?: string | null;
  taskId?: string | null;
  provider?: AgentName;
  model?: string | null;
  effort?: ModelEffort | null;
  allowWrites?: boolean;
  mode: string;
  prompt: string;
  startedAt: string;
};

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function parseJsonArray<T>(value: string | null, fallback: T[]) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function mapConversation(model: AgentConversation): Conversation {
  return {
    id: model.getAttribute('id'),
    title: model.getAttribute('title'),
    mode: model.getAttribute('mode'),
    projectPath: model.getAttribute('project_path'),
    createdAt: toIso(model.getAttribute('created_at')),
    updatedAt: toIso(model.getAttribute('updated_at')),
  };
}

function mapMessage(model: AgentMessage): ChatMessage {
  const metadataJson = model.getAttribute('metadata_json') as string | null;
  return {
    id: model.getAttribute('id'),
    conversationId: model.getAttribute('conversation_id'),
    participant: model.getAttribute('participant'),
    content: model.getAttribute('content'),
    createdAt: toIso(model.getAttribute('created_at')),
    metadata: metadataJson ? JSON.parse(metadataJson) : undefined,
  };
}

function mapTeamMember(model: AgentTeamMember): TeamMember {
  return {
    id: model.getAttribute('id'),
    conversationId: model.getAttribute('conversation_id'),
    title: model.getAttribute('title'),
    provider: model.getAttribute('provider'),
    role: model.getAttribute('role'),
    model: model.getAttribute('model'),
    effort: model.getAttribute('effort'),
    canWrite: Boolean(model.getAttribute('can_write')),
    participatesInLoop: Boolean(model.getAttribute('participates_in_loop')),
    capabilities: parseJsonArray<TeamMemberCapability>(model.getAttribute('capabilities_json'), []),
    systemPrompt: model.getAttribute('system_prompt'),
    createdAt: toIso(model.getAttribute('created_at')),
    updatedAt: toIso(model.getAttribute('updated_at')),
  };
}

function mapTask(model: AgentTaskModel): AgentTask {
  return {
    id: model.getAttribute('id'),
    conversationId: model.getAttribute('conversation_id'),
    title: model.getAttribute('title'),
    description: model.getAttribute('description'),
    status: model.getAttribute('status'),
    priority: model.getAttribute('priority'),
    assigneeId: model.getAttribute('assignee_id'),
    createdByMemberId: model.getAttribute('created_by_member_id'),
    acceptedByMemberId: model.getAttribute('accepted_by_member_id'),
    blockedReason: model.getAttribute('blocked_reason'),
    resultSummary: model.getAttribute('result_summary'),
    createdAt: toIso(model.getAttribute('created_at')),
    updatedAt: toIso(model.getAttribute('updated_at')),
  };
}

function mapTaskEvent(model: AgentTaskEvent): TaskEvent {
  const metadataJson = model.getAttribute('metadata_json') as string | null;
  return {
    id: model.getAttribute('id'),
    conversationId: model.getAttribute('conversation_id'),
    taskId: model.getAttribute('task_id'),
    type: model.getAttribute('type'),
    actorMemberId: model.getAttribute('actor_member_id'),
    content: model.getAttribute('content'),
    metadata: metadataJson ? JSON.parse(metadataJson) : undefined,
    createdAt: toIso(model.getAttribute('created_at')),
  };
}

/**
 * Repositorio do Agent Room sobre o ORM do Svelar (database.db + migrations).
 * Todos os ids sao UUID v7 (time-ordered), gerados aqui na escrita.
 */
export class AgentRoomRepository {
  async listConversations(): Promise<Conversation[]> {
    const rows = await AgentConversation.query().orderBy('updated_at', 'desc').get();
    return rows.map(mapConversation);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const model = await AgentConversation.find(id);
    return model ? mapConversation(model) : null;
  }

  async createConversation(input: { title: string; mode: ConversationMode; projectPath?: string | null }): Promise<Conversation> {
    const model = await AgentConversation.create({
      id: uuidv7(),
      title: input.title.trim() || 'Nova conversa',
      mode: input.mode,
      project_path: input.projectPath ?? null,
    });
    return mapConversation(model);
  }

  async renameConversation(id: string, title: string): Promise<Conversation | null> {
    const nextTitle = title.trim();
    if (!nextTitle) {
      throw new Error('O nome da conversa nao pode ficar vazio.');
    }

    const model = await AgentConversation.find(id);
    if (!model) return null;
    await model.update({ title: nextTitle });
    return this.getConversation(id);
  }

  async deleteConversation(id: string): Promise<boolean> {
    await AgentTaskEvent.query().where('conversation_id', id).delete();
    await AgentTaskModel.query().where('conversation_id', id).delete();
    await AgentTeamMember.query().where('conversation_id', id).delete();
    await AgentRun.query().where('conversation_id', id).delete();
    await AgentMessage.query().where('conversation_id', id).delete();
    const deleted = await AgentConversation.query().where('id', id).delete();
    return deleted > 0;
  }

  async touchConversation(id: string): Promise<void> {
    await AgentConversation.query().where('id', id).update({ updated_at: new Date() });
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const rows = await AgentMessage.query().where('conversation_id', conversationId).orderBy('created_at', 'asc').get();
    return rows.map(mapMessage);
  }

  async addMessage(input: {
    conversationId: string;
    participant: ChatMessage['participant'];
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<ChatMessage> {
    const model = await AgentMessage.create({
      id: uuidv7(),
      conversation_id: input.conversationId,
      participant: input.participant,
      content: input.content,
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      created_at: new Date(),
    });
    await this.touchConversation(input.conversationId);
    return mapMessage(model);
  }

  async createAgentRun(input: AgentRunInput): Promise<void> {
    await AgentRun.create({
      id: input.id,
      conversation_id: input.conversationId,
      agent: input.agent,
      member_id: input.memberId ?? null,
      task_id: input.taskId ?? null,
      provider: input.provider ?? input.agent,
      model: input.model ?? null,
      effort: input.effort ?? null,
      allow_writes: input.allowWrites ?? false,
      mode: input.mode,
      prompt: input.prompt,
      started_at: input.startedAt,
    });
  }

  async finishAgentRun(input: {
    id: string;
    output: string;
    rawOutput?: string;
    exitCode: number;
    error?: string;
    finishedAt: string;
  }): Promise<void> {
    await AgentRun.query().where('id', input.id).update({
      output: input.output,
      raw_output: input.rawOutput ?? null,
      exit_code: input.exitCode,
      error: input.error ?? null,
      finished_at: input.finishedAt,
    });
  }

  async listTeamMembers(conversationId: string): Promise<TeamMember[]> {
    const rows = await AgentTeamMember.query().where('conversation_id', conversationId).orderBy('created_at', 'asc').get();
    return rows.map(mapTeamMember);
  }

  async getTeamMember(id: string): Promise<TeamMember | null> {
    const model = await AgentTeamMember.find(id);
    return model ? mapTeamMember(model) : null;
  }

  async addTeamMember(input: {
    conversationId: string;
    title: string;
    provider: AgentName;
    role: TeamMemberRole;
    model?: string | null;
    effort: ModelEffort;
    canWrite: boolean;
    participatesInLoop: boolean;
    capabilities: TeamMemberCapability[];
    systemPrompt: string;
  }): Promise<TeamMember> {
    const model = await AgentTeamMember.create({
      id: uuidv7(),
      conversation_id: input.conversationId,
      title: input.title.trim(),
      provider: input.provider,
      role: input.role,
      model: input.model?.trim() || null,
      effort: input.effort,
      can_write: input.canWrite,
      participates_in_loop: input.participatesInLoop,
      capabilities_json: JSON.stringify(input.capabilities),
      system_prompt: input.systemPrompt.trim(),
    });
    await this.touchConversation(input.conversationId);
    return mapTeamMember(model);
  }

  async updateTeamMember(
    id: string,
    input: Partial<Omit<TeamMember, 'id' | 'conversationId' | 'createdAt' | 'updatedAt'>>
  ): Promise<TeamMember | null> {
    const existing = await this.getTeamMember(id);
    if (!existing) return null;

    const model = await AgentTeamMember.find(id);
    if (!model) return null;
    await model.update({
      title: input.title?.trim() || existing.title,
      provider: input.provider ?? existing.provider,
      role: input.role ?? existing.role,
      model: input.model === undefined ? existing.model : input.model?.trim() || null,
      effort: input.effort ?? existing.effort,
      can_write: input.canWrite ?? existing.canWrite,
      participates_in_loop: input.participatesInLoop ?? existing.participatesInLoop,
      capabilities_json: JSON.stringify(input.capabilities ?? existing.capabilities),
      system_prompt: input.systemPrompt?.trim() || existing.systemPrompt,
    });
    await this.touchConversation(existing.conversationId);
    return this.getTeamMember(id);
  }

  async deleteTeamMember(id: string): Promise<boolean> {
    const member = await this.getTeamMember(id);
    if (!member) return false;
    await AgentTaskModel.query().where('assignee_id', id).update({ assignee_id: null });
    const deleted = await AgentTeamMember.query().where('id', id).delete();
    await this.touchConversation(member.conversationId);
    return deleted > 0;
  }

  async listTasks(conversationId: string): Promise<AgentTask[]> {
    const rows = await AgentTaskModel.query()
      .where('conversation_id', conversationId)
      .orderBy('priority', 'desc')
      .orderBy('created_at', 'asc')
      .get();
    return rows.map(mapTask);
  }

  async getTask(id: string): Promise<AgentTask | null> {
    const model = await AgentTaskModel.find(id);
    return model ? mapTask(model) : null;
  }

  async addTask(input: {
    conversationId: string;
    title: string;
    description: string;
    status: TaskStatus;
    priority?: number;
    assigneeId?: string | null;
    createdByMemberId?: string | null;
  }): Promise<AgentTask> {
    const model = await AgentTaskModel.create({
      id: uuidv7(),
      conversation_id: input.conversationId,
      title: input.title.trim(),
      description: input.description.trim(),
      status: input.status,
      priority: input.priority ?? 0,
      assignee_id: input.assigneeId ?? null,
      created_by_member_id: input.createdByMemberId ?? null,
      accepted_by_member_id: null,
      blocked_reason: null,
      result_summary: null,
    });
    await this.touchConversation(input.conversationId);
    return mapTask(model);
  }

  async updateTask(
    id: string,
    input: Partial<Pick<AgentTask, 'title' | 'description' | 'status' | 'priority' | 'assigneeId' | 'acceptedByMemberId' | 'blockedReason' | 'resultSummary'>>
  ): Promise<AgentTask | null> {
    const existing = await this.getTask(id);
    if (!existing) return null;

    const model = await AgentTaskModel.find(id);
    if (!model) return null;
    await model.update({
      title: input.title?.trim() || existing.title,
      description: input.description?.trim() || existing.description,
      status: input.status ?? existing.status,
      priority: input.priority ?? existing.priority,
      assignee_id: input.assigneeId === undefined ? existing.assigneeId : input.assigneeId,
      accepted_by_member_id: input.acceptedByMemberId === undefined ? existing.acceptedByMemberId : input.acceptedByMemberId,
      blocked_reason: input.blockedReason === undefined ? existing.blockedReason : input.blockedReason,
      result_summary: input.resultSummary === undefined ? existing.resultSummary : input.resultSummary,
    });
    await this.touchConversation(existing.conversationId);
    return this.getTask(id);
  }

  async deleteTask(conversationId: string, taskId: string): Promise<boolean> {
    const task = await this.getTask(taskId);
    if (!task || task.conversationId !== conversationId) return false;

    await AgentTaskEvent.query().where('task_id', taskId).delete();
    await AgentRun.query().where('task_id', taskId).update({ task_id: null });
    const deleted = await AgentTaskModel.query().where('id', taskId).where('conversation_id', conversationId).delete();
    if (deleted > 0) await this.touchConversation(conversationId);
    return deleted > 0;
  }

  async addTaskEvent(input: {
    conversationId: string;
    taskId: string;
    type: string;
    actorMemberId?: string | null;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<TaskEvent> {
    const model = await AgentTaskEvent.create({
      id: uuidv7(),
      conversation_id: input.conversationId,
      task_id: input.taskId,
      type: input.type,
      actor_member_id: input.actorMemberId ?? null,
      content: input.content,
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      created_at: new Date(),
    });
    return mapTaskEvent(model);
  }

  async listTaskEvents(conversationId: string, taskId?: string): Promise<TaskEvent[]> {
    const query = AgentTaskEvent.query().where('conversation_id', conversationId).orderBy('created_at', 'asc');
    if (taskId) query.where('task_id', taskId);
    const rows = await query.get();
    return rows.map(mapTaskEvent);
  }
}

export const agentRoomRepository = new AgentRoomRepository();
