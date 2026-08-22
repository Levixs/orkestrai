import { uuidv7 } from '@beeblock/svelar/support';
import type { WorkspaceHuddle, WorkspaceHuddleParticipant, WorkspaceHuddleParticipantKind, WorkspaceHuddleSnapshot } from '../../domain/types.js';
import type { ContributeHuddleTurnDto, CreateHuddleDto, CreateHuddleTaskDto, SubmitHuddleTurnDto, UpdateHuddleDto } from '../dto/HuddleDtos.js';
import { huddleRepository } from '../../infrastructure/repositories/HuddleRepository.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { bridgeService } from './BridgeService.js';
import { taskBoardService } from './TaskBoardService.js';
import { controlCenterService } from './ControlCenterService.js';

export type HuddleActor = {
  kind: WorkspaceHuddleParticipantKind;
  id: string | null;
  name: string;
};

type LockState = { tails: Map<string, Promise<unknown>> };
const lockKey = Symbol.for('orkestrai.huddle.locks');
const lockState = ((globalThis as typeof globalThis & { [lockKey]?: LockState })[lockKey] ??= { tails: new Map() });

function broadcast(workspaceId: string): void {
  (
    globalThis as {
      __orkestraiBroadcast?: (frame: Record<string, unknown>) => void;
    }
  ).__orkestraiBroadcast?.({ type: 'huddleChanged', workspaceId });
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('sessão pty') || message.includes('session')) return 'AGENT_OFFLINE';
  if (message.includes('timeout') || message.includes('tempo')) return 'AGENT_TIMEOUT';
  return 'AGENT_REPLY_FAILED';
}

function transcript(huddle: WorkspaceHuddle): string {
  return huddle.turns
    .filter((turn) => turn.state === 'completed' && turn.text.trim())
    .slice(-16)
    .map((turn) => `${turn.speakerName}: ${turn.text}`)
    .join('\n')
    .slice(-8_000);
}

export class HuddleService {
  private async locked<T>(key: string, run: () => Promise<T>): Promise<T> {
    const previous = lockState.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    lockState.tails.set(key, tail);
    await previous.catch(() => undefined);
    try {
      return await run();
    } finally {
      release();
      if (lockState.tails.get(key) === tail) lockState.tails.delete(key);
    }
  }

  async snapshot(workspaceId: string, selectedId?: string | null): Promise<WorkspaceHuddleSnapshot> {
    await this.requireWorkspace(workspaceId);
    await huddleRepository.markStalePending(workspaceId, new Date(Date.now() - 10 * 60_000).toISOString());
    const [huddles, active] = await Promise.all([huddleRepository.list(workspaceId), huddleRepository.active(workspaceId)]);
    const targetId = selectedId ?? active?.id ?? huddles[0]?.id ?? null;
    const selected = targetId === active?.id ? active : targetId ? await huddleRepository.find(workspaceId, targetId) : null;
    return { huddles, selected, activeHuddleId: active?.id ?? null };
  }

  async create(workspaceId: string, dto: CreateHuddleDto, actor: HuddleActor): Promise<WorkspaceHuddle> {
    return this.locked(`workspace:${workspaceId}`, async () => {
      await this.requireWorkspace(workspaceId);
      if (await huddleRepository.active(workspaceId)) throw new Error('HUDDLE_ALREADY_ACTIVE');
      const agents = await this.resolveAgents(workspaceId, dto.agentNodeIds);
      if (agents.length > 11) throw new Error('HUDDLE_PARTICIPANT_LIMIT');
      const facilitator = dto.facilitatorNodeId
        ? agents.find((node) => node.id === dto.facilitatorNodeId)
        : (agents.find((node) => {
            const payload = node.payload as {
              maestro?: boolean;
              isMaestro?: boolean;
            };
            return Boolean(payload.maestro || payload.isMaestro);
          }) ?? agents[0]);
      if (!facilitator) throw new Error('HUDDLE_FACILITATOR_NOT_FOUND');
      const participants: Array<{
        kind: WorkspaceHuddleParticipantKind;
        participantId: string;
        displayName: string;
        role: WorkspaceHuddleParticipant['role'];
      }> = [
        {
          kind: actor.kind,
          participantId: actor.id ?? `local:${workspaceId}`,
          displayName: actor.name,
          role: 'member',
        },
      ];
      for (const node of agents) {
        participants.push({
          kind: 'agent',
          participantId: node.id,
          displayName: node.title ?? node.id.slice(0, 8),
          role: node.id === facilitator.id ? 'facilitator' : 'member',
        });
      }
      const huddle = await huddleRepository.create({
        workspaceId,
        title: dto.title,
        agenda: dto.agenda,
        facilitatorNodeId: facilitator.id,
        createdByKind: actor.kind,
        createdById: actor.id,
        participants,
      });
      await controlCenterService.recordActivity({
        workspaceId,
        nodeId: facilitator.id,
        state: 'working',
        action: 'system:huddle_started',
        category: 'workflow',
        verb: 'started',
        objectType: 'huddle',
        objectId: huddle.id,
        objectTitle: huddle.title,
        correlationId: `huddle:${huddle.id}`,
        sourceType: 'huddle',
        sourceId: huddle.id,
      });
      broadcast(workspaceId);
      return huddle;
    });
  }

  async update(workspaceId: string, huddleId: string, dto: UpdateHuddleDto): Promise<WorkspaceHuddle> {
    return this.locked(huddleId, async () => {
      const huddle = await this.requireActive(workspaceId, huddleId);
      if (dto.operation === 'end') {
        const ended = await huddleRepository.end(workspaceId, huddleId);
        if (huddle.facilitatorNodeId) {
          await controlCenterService.recordActivity({
            workspaceId,
            nodeId: huddle.facilitatorNodeId,
            state: 'idle',
            action: 'system:huddle_ended',
            category: 'workflow',
            verb: 'ended',
            objectType: 'huddle',
            objectId: huddle.id,
            objectTitle: huddle.title,
            correlationId: `huddle:${huddle.id}`,
            sourceType: 'huddle',
            sourceId: huddle.id,
          });
        }
        broadcast(workspaceId);
        return ended!;
      }
      const agents = await this.resolveAgents(workspaceId, dto.agentNodeIds);
      const existingIds = new Set(huddle.participants.filter((participant) => !participant.leftAt).map((participant) => participant.participantId));
      const additions = agents.filter((node) => !existingIds.has(node.id));
      if (huddle.participants.filter((participant) => !participant.leftAt).length + additions.length > 12) {
        throw new Error('HUDDLE_PARTICIPANT_LIMIT');
      }
      for (const node of agents) {
        await huddleRepository.addParticipant(huddle, {
          kind: 'agent',
          participantId: node.id,
          displayName: node.title ?? node.id.slice(0, 8),
          role: 'member',
        });
      }
      broadcast(workspaceId);
      return (await huddleRepository.find(workspaceId, huddleId))!;
    });
  }

  async submit(workspaceId: string, huddleId: string, dto: SubmitHuddleTurnDto, actor: HuddleActor): Promise<WorkspaceHuddle> {
    const pending = await this.locked(huddleId, async () => {
      const huddle = await this.requireActive(workspaceId, huddleId);
      const agentIds = new Set(huddle.participants.filter((item) => item.kind === 'agent' && !item.leftAt).map((item) => item.participantId));
      if (dto.targetNodeIds.some((id) => !agentIds.has(id))) throw new Error('HUDDLE_TARGET_NOT_PARTICIPANT');
      await huddleRepository.appendTurn(huddle, {
        speakerKind: actor.kind,
        speakerId: actor.id,
        speakerName: actor.name,
        addressedNodeId: dto.targetNodeIds.length === 1 ? dto.targetNodeIds[0] : null,
        text: dto.text,
        state: 'completed',
        messageId: null,
        errorCode: null,
      });
      const refreshed = (await huddleRepository.find(workspaceId, huddleId))!;
      const placeholders = [];
      for (const nodeId of dto.targetNodeIds) {
        const participant = refreshed.participants.find((item) => item.kind === 'agent' && item.participantId === nodeId)!;
        placeholders.push(
          await huddleRepository.appendTurn(refreshed, {
            speakerKind: 'agent',
            speakerId: nodeId,
            speakerName: participant.displayName,
            addressedNodeId: null,
            text: '',
            state: 'pending',
            messageId: uuidv7(),
            errorCode: null,
          }),
        );
      }
      broadcast(workspaceId);
      return placeholders;
    });
    queueMicrotask(() => {
      for (const placeholder of pending) void this.answer(workspaceId, huddleId, placeholder.id, placeholder.speakerId!, dto.text);
    });
    return (await huddleRepository.find(workspaceId, huddleId))!;
  }

  async contribute(workspaceId: string, huddleId: string, agentNodeId: string, dto: ContributeHuddleTurnDto): Promise<WorkspaceHuddle> {
    return this.locked(huddleId, async () => {
      const huddle = await this.requireActive(workspaceId, huddleId);
      const participant = huddle.participants.find((item) => item.kind === 'agent' && item.participantId === agentNodeId && !item.leftAt);
      if (!participant) throw new Error('HUDDLE_AGENT_NOT_PARTICIPANT');
      await huddleRepository.appendTurn(huddle, {
        speakerKind: 'agent',
        speakerId: agentNodeId,
        speakerName: participant.displayName,
        addressedNodeId: null,
        text: dto.text,
        state: 'completed',
        messageId: null,
        errorCode: null,
      });
      broadcast(workspaceId);
      return (await huddleRepository.find(workspaceId, huddleId))!;
    });
  }

  async createTask(workspaceId: string, huddleId: string, dto: CreateHuddleTaskDto) {
    return this.locked(huddleId, async () => {
      const huddle = await this.requireHuddle(workspaceId, huddleId);
      if (huddle.linkedTaskId) throw new Error('HUDDLE_TASK_ALREADY_LINKED');
      const body = [
        `Huddle: ${huddle.title}`,
        huddle.agenda ? `Agenda: ${huddle.agenda}` : '',
        '',
        'Transcript:',
        huddle.turns
          .filter((turn) => turn.state === 'completed' && turn.text.trim())
          .map((turn) => `- ${turn.speakerName}: ${turn.text}`)
          .join('\n'),
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 50_000);
      const task = await taskBoardService.create(workspaceId, {
        title: dto.title,
        description: body,
        createdBy: 'huddle',
        status: dto.status,
      });
      await huddleRepository.linkTask(workspaceId, huddleId, task.id);
      broadcast(workspaceId);
      return task;
    });
  }

  private async answer(workspaceId: string, huddleId: string, turnId: string, nodeId: string, question: string): Promise<void> {
    const huddle = await huddleRepository.find(workspaceId, huddleId);
    if (!huddle) return;
    const prompt = [
      'You are participating in a live Orkestrai huddle.',
      `Topic: ${huddle.title}`,
      huddle.agenda ? `Agenda: ${huddle.agenda}` : '',
      'Reply conversationally in the same language as the latest speaker. Be concrete and concise (2-5 sentences).',
      'Do not claim that you spoke to another participant unless that exchange appears in the transcript.',
      transcript(huddle) ? `Recent transcript:\n${transcript(huddle)}` : '',
      `Latest question: ${question}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      const result = await bridgeService.ask(workspaceId, {
        to: nodeId,
        message: prompt,
        messageId: uuidv7(),
        timeoutMs: 180_000,
        metadata: {
          kind: 'huddle',
          huddleId,
          huddleTurnId: turnId,
          correlationId: `huddle:${huddleId}`,
        },
      });
      await huddleRepository.completeTurn(turnId, {
        text: result.reply.trim() || 'No response was returned.',
        state: result.delivered ? 'completed' : 'failed',
        messageId: result.messageId,
        errorCode: result.delivered ? null : 'AGENT_REPLY_FAILED',
      });
    } catch (error) {
      await huddleRepository.completeTurn(turnId, {
        text: '',
        state: 'failed',
        errorCode: errorCode(error),
      });
    } finally {
      broadcast(workspaceId);
    }
  }

  private async resolveAgents(workspaceId: string, ids: string[]) {
    const nodes = await workspaceRepository.listNodes(workspaceId, undefined, false, true);
    const wanted = new Set(ids);
    const agents = nodes.filter((node) => wanted.has(node.id) && node.type === 'terminal' && Boolean((node.payload as { provider?: string }).provider));
    if (agents.length !== wanted.size) throw new Error('HUDDLE_AGENT_NOT_FOUND');
    return agents;
  }

  private async requireWorkspace(workspaceId: string) {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');
    return workspace;
  }

  private async requireHuddle(workspaceId: string, huddleId: string): Promise<WorkspaceHuddle> {
    const huddle = await huddleRepository.find(workspaceId, huddleId);
    if (!huddle) throw new Error('HUDDLE_NOT_FOUND');
    return huddle;
  }

  private async requireActive(workspaceId: string, huddleId: string): Promise<WorkspaceHuddle> {
    const huddle = await this.requireHuddle(workspaceId, huddleId);
    if (huddle.status !== 'active') throw new Error('HUDDLE_ENDED');
    return huddle;
  }
}

export const huddleService = new HuddleService();
