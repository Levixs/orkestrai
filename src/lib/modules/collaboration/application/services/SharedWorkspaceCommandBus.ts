import { bridgeService } from '$lib/modules/agent-room/application/services/BridgeService.js';
import { reviewCenterService } from '$lib/modules/agent-room/application/services/ReviewCenterService.js';
import { taskBoardService } from '$lib/modules/agent-room/application/services/TaskBoardService.js';
import { DecideAgentReviewDto } from '$lib/modules/agent-room/application/dto/AgentReviewDto.js';
import { agentSessionService } from '$lib/modules/agent-room/application/services/AgentSessionService.js';
import { uuidv7 } from '@beeblock/svelar/support';
import type { ExecuteCollaborationCommandDto } from '../dto/CollaborationDto.js';
import type { CollaborationCommand, CollaborationCommandResult } from '../../domain/types.js';
import { collaborationPolicy } from '../../domain/policies/CollaborationPolicy.js';
import { collaborationRepository } from '../../infrastructure/repositories/CollaborationRepository.js';
import { sanitizeAuditMetadata } from '../projections/sanitize-shared-data.js';
import { withCollaborationShareLock } from './CollaborationShareLock.js';

export class SharedWorkspaceCommandBus {
  async execute(shareId: string, deviceRecordId: string, dto: ExecuteCollaborationCommandDto): Promise<CollaborationCommandResult> {
    return withCollaborationShareLock(shareId, () => this.executeLocked(shareId, deviceRecordId, dto));
  }

  private async executeLocked(
    shareId: string,
    deviceRecordId: string,
    dto: ExecuteCollaborationCommandDto,
  ): Promise<CollaborationCommandResult> {
    const duplicate = await collaborationRepository.findCommand(dto.commandId);
    if (duplicate) {
      if (duplicate.shareId !== shareId || duplicate.deviceRecordId !== deviceRecordId) {
        return { commandId: dto.commandId, accepted: false, revision: duplicate.resultRevision, result: null, errorCode: 'COMMAND_ID_CONFLICT' };
      }
      return {
        commandId: duplicate.id,
        accepted: duplicate.status === 'accepted',
        revision: duplicate.resultRevision,
        result: duplicate.result,
        errorCode: duplicate.status === 'processing' ? 'COMMAND_IN_PROGRESS' : duplicate.errorCode,
      };
    }

    const [share, device] = await Promise.all([
      collaborationRepository.findShare(shareId),
      collaborationRepository.findDevice(deviceRecordId),
    ]);
    if (!share || !device || device.shareId !== shareId || device.workspaceId !== share.workspaceId) {
      return { commandId: dto.commandId, accepted: false, revision: share?.revision ?? 0, result: null, errorCode: 'ACCESS_DENIED' };
    }
    await collaborationRepository.startCommand({
      id: dto.commandId, shareId, workspaceId: share.workspaceId,
      deviceRecordId, revision: dto.revision, type: dto.command.type,
    });

    const reject = async (errorCode: string, metadata: Record<string, unknown> = {}): Promise<CollaborationCommandResult> => {
      const row = await collaborationRepository.finishCommand(dto.commandId, {
        accepted: false, revision: share.revision, errorCode,
      });
      await collaborationRepository.appendAudit({
        workspaceId: share.workspaceId, shareId, actorDeviceId: device.deviceId,
        eventType: 'command.rejected', metadata: { commandId: dto.commandId, commandType: dto.command.type, errorCode, ...metadata },
      });
      return { commandId: row.id, accepted: false, revision: row.resultRevision, result: null, errorCode };
    };

    if (share.status !== 'active' || new Date(share.expiresAt).getTime() <= Date.now()) return reject('SHARE_EXPIRED');
    if (!device.approvedAt || device.revokedAt) return reject('DEVICE_NOT_APPROVED');
    const requiredScope = collaborationPolicy.commandScope(dto.command.type);
    if (!collaborationPolicy.can(device.scopes, requiredScope)) return reject('SCOPE_DENIED', { requiredScope });
    if (dto.revision !== share.revision) return reject('REVISION_CONFLICT', { currentRevision: share.revision });

    try {
      const result = await this.perform(share.workspaceId, share.id, device.deviceId, dto.command);
      const revision = await collaborationRepository.incrementRevision(share.id);
      const safeResult = sanitizeAuditMetadata(result) as Record<string, unknown>;
      const row = await collaborationRepository.finishCommand(dto.commandId, {
        accepted: true, revision, result: safeResult,
      });
      await collaborationRepository.touchDevice(device.id);
      await collaborationRepository.appendAudit({
        workspaceId: share.workspaceId, shareId, actorDeviceId: device.deviceId,
        eventType: 'command.accepted', metadata: { commandId: dto.commandId, commandType: dto.command.type, revision },
      });
      return { commandId: row.id, accepted: true, revision, result: row.result, errorCode: null };
    } catch (error) {
      return reject('COMMAND_FAILED', { reason: error instanceof Error ? error.message : String(error) });
    }
  }

  private async perform(
    workspaceId: string,
    shareId: string,
    deviceId: string,
    command: CollaborationCommand,
  ): Promise<Record<string, unknown>> {
    if (command.type === 'task.create') {
      const task = await taskBoardService.create(workspaceId, {
        title: command.title,
        description: command.description ?? null,
        status: command.status,
        assigneeNodeId: command.assigneeNodeId ?? null,
        createdBy: 'collaboration',
      });
      return { taskId: task.id, title: task.title, status: task.status };
    }
    if (command.type === 'task.update') {
      const task = await taskBoardService.update(workspaceId, command.taskId, {
        title: command.title,
        description: command.description,
        status: command.status,
        assigneeNodeId: command.assigneeNodeId,
      });
      return { taskId: task.id, title: task.title, status: task.status };
    }
    if (command.type === 'review.decide') {
      const decision = await reviewCenterService.decide(
        workspaceId,
        command.reviewId,
        new DecideAgentReviewDto(command.status, command.note ?? null),
      );
      return { reviewId: decision.review.id, status: decision.review.status, feedbackDelivered: decision.feedback?.delivered ?? null };
    }
    if (command.type === 'agent.invoke') {
      const session = await agentSessionService.ensure(workspaceId, command.agentNodeId);
      return { agentNodeId: command.agentNodeId, sessionId: session.sessionId, state: session.state };
    }
    if (command.type === 'agent.message') {
      const target = (await bridgeService.listAgents(workspaceId)).find((agent) => agent.nodeId === command.agentNodeId);
      if (!target) throw new Error('AGENT_NOT_FOUND');
      if (!target.sessionAlive) throw new Error('AGENT_SESSION_OFFLINE');
      const messageId = uuidv7();
      void bridgeService.ask(workspaceId, {
        to: target.nodeId,
        message: command.message,
        messageId,
        metadata: {
          remoteCollaboration: true,
          remoteShareId: shareId,
          remoteDeviceId: deviceId,
        },
      }).catch(() => undefined);
      return { messageId, agentNodeId: target.nodeId, agentTitle: target.title };
    }
    const leader = (await bridgeService.listAgents(workspaceId)).find((agent) => agent.maestro);
    if (!leader) throw new Error('Workspace leader is unavailable.');
    const delivery = await bridgeService.sendOneWay(workspaceId, {
      to: leader.nodeId,
      message: command.message,
      kind: 'remote-collaboration',
    });
    return { messageId: delivery.messageId, delivered: delivery.sent, leaderTitle: leader.title };
  }
}

export const sharedWorkspaceCommandBus = new SharedWorkspaceCommandBus();
