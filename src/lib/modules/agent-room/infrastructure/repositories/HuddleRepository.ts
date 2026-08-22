import { Connection } from '@beeblock/svelar/database';
import { uuidv7 } from '@beeblock/svelar/support';
import type {
  WorkspaceHuddle,
  WorkspaceHuddleParticipant,
  WorkspaceHuddleParticipantKind,
  WorkspaceHuddleStatus,
  WorkspaceHuddleSummary,
  WorkspaceHuddleTurn,
  WorkspaceHuddleTurnState,
} from '../../domain/types.js';
import { AgentHuddle } from '../../domain/models/AgentHuddle.js';
import { AgentHuddleParticipant } from '../../domain/models/AgentHuddleParticipant.js';
import { AgentHuddleTurn } from '../../domain/models/AgentHuddleTurn.js';

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function nullableIso(value: unknown): string | null {
  return value ? iso(value) : null;
}

function mapParticipant(model: AgentHuddleParticipant): WorkspaceHuddleParticipant {
  return {
    id: String(model.getAttribute('id')),
    kind: model.getAttribute('kind') as WorkspaceHuddleParticipantKind,
    participantId: String(model.getAttribute('participant_id')),
    displayName: String(model.getAttribute('display_name')),
    role: model.getAttribute('role') as WorkspaceHuddleParticipant['role'],
    voiceEnabled: Boolean(model.getAttribute('voice_enabled')),
    joinedAt: iso(model.getAttribute('joined_at')),
    leftAt: nullableIso(model.getAttribute('left_at')),
  };
}

function mapTurn(model: AgentHuddleTurn): WorkspaceHuddleTurn {
  return {
    id: String(model.getAttribute('id')),
    sequence: Number(model.getAttribute('sequence')),
    speakerKind: model.getAttribute('speaker_kind') as WorkspaceHuddleParticipantKind,
    speakerId: model.getAttribute('speaker_id') as string | null,
    speakerName: String(model.getAttribute('speaker_name')),
    addressedNodeId: model.getAttribute('addressed_node_id') as string | null,
    text: String(model.getAttribute('text')),
    state: model.getAttribute('state') as WorkspaceHuddleTurnState,
    messageId: model.getAttribute('message_id') as string | null,
    errorCode: model.getAttribute('error_code') as string | null,
    createdAt: iso(model.getAttribute('created_at')),
    completedAt: nullableIso(model.getAttribute('completed_at')),
  };
}

export class HuddleRepository {
  async list(workspaceId: string): Promise<WorkspaceHuddleSummary[]> {
    const huddles = await AgentHuddle.query().where('workspace_id', workspaceId).orderBy('updated_at', 'desc').limit(30).get();
    if (!huddles.length) return [];
    const ids = huddles.map((model) => String(model.getAttribute('id')));
    const [participants, turns] = await Promise.all([
      AgentHuddleParticipant.query().whereIn('huddle_id', ids).get(),
      AgentHuddleTurn.query().whereIn('huddle_id', ids).get(),
    ]);
    const participantCounts = new Map<string, number>();
    const turnCounts = new Map<string, number>();
    for (const participant of participants) {
      if (participant.getAttribute('left_at')) continue;
      const id = String(participant.getAttribute('huddle_id'));
      participantCounts.set(id, (participantCounts.get(id) ?? 0) + 1);
    }
    for (const turn of turns) {
      const id = String(turn.getAttribute('huddle_id'));
      turnCounts.set(id, (turnCounts.get(id) ?? 0) + 1);
    }
    return huddles.map((model) => {
      const base = this.mapHuddle(model, [], []);
      return {
        ...base,
        participantCount: participantCounts.get(base.id) ?? 0,
        turnCount: turnCounts.get(base.id) ?? 0,
      };
    });
  }

  async find(workspaceId: string, id: string): Promise<WorkspaceHuddle | null> {
    const model = await AgentHuddle.find(id);
    if (!model || model.getAttribute('workspace_id') !== workspaceId) return null;
    const [participants, turns] = await Promise.all([
      AgentHuddleParticipant.query().where('huddle_id', id).orderBy('joined_at', 'asc').get(),
      AgentHuddleTurn.query().where('huddle_id', id).orderBy('sequence', 'asc').limit(300).get(),
    ]);
    return this.mapHuddle(model, participants.map(mapParticipant), turns.map(mapTurn));
  }

  async active(workspaceId: string): Promise<WorkspaceHuddle | null> {
    const model = await AgentHuddle.query().where('workspace_id', workspaceId).where('status', 'active').orderBy('started_at', 'desc').first();
    return model ? this.find(workspaceId, String(model.getAttribute('id'))) : null;
  }

  async create(input: {
    workspaceId: string;
    title: string;
    agenda: string | null;
    facilitatorNodeId: string | null;
    createdByKind: WorkspaceHuddleParticipantKind;
    createdById: string | null;
    participants: Array<{
      kind: WorkspaceHuddleParticipantKind;
      participantId: string;
      displayName: string;
      role: WorkspaceHuddleParticipant['role'];
      voiceEnabled?: boolean;
    }>;
  }): Promise<WorkspaceHuddle> {
    return Connection.transaction(async () => {
      const id = uuidv7();
      const now = new Date().toISOString();
      await AgentHuddle.create({
        id,
        workspace_id: input.workspaceId,
        title: input.title,
        agenda: input.agenda,
        status: 'active',
        facilitator_node_id: input.facilitatorNodeId,
        linked_task_id: null,
        created_by_kind: input.createdByKind,
        created_by_id: input.createdById,
        started_at: now,
        ended_at: null,
        created_at: now,
        updated_at: now,
      });
      for (const participant of input.participants) {
        await AgentHuddleParticipant.create({
          id: uuidv7(),
          huddle_id: id,
          workspace_id: input.workspaceId,
          kind: participant.kind,
          participant_id: participant.participantId,
          participant_key: `${id}:${participant.kind}:${participant.participantId}`,
          display_name: participant.displayName,
          role: participant.role,
          voice_enabled: participant.voiceEnabled ?? true,
          joined_at: now,
          left_at: null,
          created_at: now,
          updated_at: now,
        });
      }
      return (await this.find(input.workspaceId, id))!;
    });
  }

  async addParticipant(
    huddle: WorkspaceHuddle,
    participant: {
      kind: WorkspaceHuddleParticipantKind;
      participantId: string;
      displayName: string;
      role: WorkspaceHuddleParticipant['role'];
    },
  ): Promise<void> {
    if (huddle.participants.some((item) => item.kind === participant.kind && item.participantId === participant.participantId && !item.leftAt)) return;
    const now = new Date().toISOString();
    await AgentHuddleParticipant.create({
      id: uuidv7(),
      huddle_id: huddle.id,
      workspace_id: huddle.workspaceId,
      kind: participant.kind,
      participant_id: participant.participantId,
      participant_key: `${huddle.id}:${participant.kind}:${participant.participantId}`,
      display_name: participant.displayName,
      role: participant.role,
      voice_enabled: true,
      joined_at: now,
      left_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  async appendTurn(huddle: WorkspaceHuddle, input: Omit<WorkspaceHuddleTurn, 'id' | 'sequence' | 'createdAt' | 'completedAt'>): Promise<WorkspaceHuddleTurn> {
    const existing = await AgentHuddleTurn.query().where('huddle_id', huddle.id).orderBy('sequence', 'desc').first();
    const sequence = Number(existing?.getAttribute('sequence') ?? 0) + 1;
    const id = uuidv7();
    const now = new Date().toISOString();
    await AgentHuddleTurn.create({
      id,
      huddle_id: huddle.id,
      workspace_id: huddle.workspaceId,
      sequence,
      turn_key: `${huddle.id}:${sequence}`,
      speaker_kind: input.speakerKind,
      speaker_id: input.speakerId,
      speaker_name: input.speakerName,
      addressed_node_id: input.addressedNodeId,
      text: input.text,
      state: input.state,
      message_id: input.messageId,
      error_code: input.errorCode,
      completed_at: input.state === 'pending' ? null : now,
      created_at: now,
      updated_at: now,
    });
    await AgentHuddle.query().where('id', huddle.id).update({ updated_at: now });
    return mapTurn((await AgentHuddleTurn.find(id))!);
  }

  async completeTurn(
    id: string,
    input: {
      text: string;
      state: 'completed' | 'failed';
      messageId?: string | null;
      errorCode?: string | null;
    },
  ): Promise<void> {
    const now = new Date().toISOString();
    const turn = await AgentHuddleTurn.find(id);
    if (!turn) return;
    await AgentHuddleTurn.query()
      .where('id', id)
      .update({
        text: input.text,
        state: input.state,
        message_id: input.messageId ?? null,
        error_code: input.errorCode ?? null,
        completed_at: now,
        updated_at: now,
      });
    await AgentHuddle.query()
      .where('id', String(turn.getAttribute('huddle_id')))
      .update({ updated_at: now });
  }

  async end(workspaceId: string, id: string): Promise<WorkspaceHuddle | null> {
    const current = await this.find(workspaceId, id);
    if (!current) return null;
    const now = new Date().toISOString();
    await AgentHuddle.query().where('id', id).update({ status: 'ended', ended_at: now, updated_at: now });
    return this.find(workspaceId, id);
  }

  async linkTask(workspaceId: string, id: string, taskId: string): Promise<WorkspaceHuddle | null> {
    const current = await this.find(workspaceId, id);
    if (!current) return null;
    await AgentHuddle.query().where('id', id).update({ linked_task_id: taskId, updated_at: new Date().toISOString() });
    return this.find(workspaceId, id);
  }

  async markStalePending(workspaceId: string, olderThan: string): Promise<number> {
    return AgentHuddleTurn.query().where('workspace_id', workspaceId).where('state', 'pending').where('created_at', '<', olderThan).update({
      state: 'failed',
      error_code: 'HUDDLE_INTERRUPTED',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  private mapHuddle(model: AgentHuddle, participants: WorkspaceHuddleParticipant[], turns: WorkspaceHuddleTurn[]): WorkspaceHuddle {
    return {
      id: String(model.getAttribute('id')),
      workspaceId: String(model.getAttribute('workspace_id')),
      title: String(model.getAttribute('title')),
      agenda: model.getAttribute('agenda') as string | null,
      status: model.getAttribute('status') as WorkspaceHuddleStatus,
      facilitatorNodeId: model.getAttribute('facilitator_node_id') as string | null,
      linkedTaskId: model.getAttribute('linked_task_id') as string | null,
      createdByKind: model.getAttribute('created_by_kind') as WorkspaceHuddleParticipantKind,
      createdById: model.getAttribute('created_by_id') as string | null,
      participants,
      turns,
      startedAt: iso(model.getAttribute('started_at')),
      endedAt: nullableIso(model.getAttribute('ended_at')),
      createdAt: iso(model.getAttribute('created_at')),
      updatedAt: iso(model.getAttribute('updated_at')),
    };
  }
}

export const huddleRepository = new HuddleRepository();
