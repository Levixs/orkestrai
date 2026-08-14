import { createHash } from 'node:crypto';
import { Features } from '@beeblock/svelar/feature-flags';
import { createInviteUri, createWebInviteUri } from '@orkestrai/collaboration-protocol';
import { workspaceService } from '$lib/modules/agent-room/application/services/WorkspaceService.js';
import type { CreateCollaborationShareDto, ApproveCollaborationDeviceDto } from '../dto/CollaborationDto.js';
import type { CollaborationJoinRequestInput } from '../../contracts/schemas/collaboration.schema.js';
import { collaborationPolicy } from '../../domain/policies/CollaborationPolicy.js';
import { collaborationRepository } from '../../infrastructure/repositories/CollaborationRepository.js';
import { collaborationRuntime } from './CollaborationRuntime.js';

export class CollaborationShareService {
  async enabled(): Promise<boolean> {
    const name = 'experimentalWorkspaceSharing';
    if (!await Features.getFlag(name)) {
      await Features.define(name, {
        description: 'Experimental end-to-end encrypted workspace collaboration preview.',
        enabled: process.env.EXPERIMENTAL_WORKSPACE_SHARING === 'true',
      });
    }
    return Features.enabled(name);
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    await this.enabled();
    if (enabled) await Features.enable('experimentalWorkspaceSharing');
    else {
      for (const share of await collaborationRepository.activeShares()) await this.stop(share.id);
      await Features.disable('experimentalWorkspaceSharing');
    }
    return this.enabled();
  }

  async status(workspaceId: string) {
    const share = await collaborationRepository.activeShare(workspaceId);
    if (!share) return { enabled: await this.enabled(), share: null, inviteAvailable: false, devices: [], audit: [] };
    if (new Date(share.expiresAt).getTime() <= Date.now()) {
      await this.stop(share.id, 'expired');
      return { enabled: await this.enabled(), share: null, inviteAvailable: false, devices: [], audit: await collaborationRepository.listAudit(workspaceId) };
    }
    if (!collaborationRuntime.get(share.id)) {
      await this.stop(share.id);
      return { enabled: await this.enabled(), share: null, inviteAvailable: false, devices: [], audit: await collaborationRepository.listAudit(workspaceId) };
    }
    return {
      enabled: await this.enabled(),
      share,
      transport: (await import('./CollaborationSessionManager.js')).collaborationSessionManager.hostStatus(share.id),
      inviteAvailable: Boolean(collaborationRuntime.get(share.id)?.pairingSecret),
      devices: await collaborationRepository.listDevices(share.id),
      audit: await collaborationRepository.listAudit(workspaceId),
    };
  }

  async create(workspaceId: string, dto: CreateCollaborationShareDto) {
    if (!await this.enabled()) throw new Error('EXPERIMENTAL_COLLABORATION_DISABLED');
    await workspaceService.get(workspaceId);
    this.assertRelayUrl(dto.relayUrl);
    const existing = await collaborationRepository.activeShare(workspaceId);
    if (existing) await this.stop(existing.id);
    const share = await collaborationRepository.createShare({
      workspaceId,
      defaultRole: dto.defaultRole,
      relayUrl: dto.relayUrl,
      maxPeers: dto.maxPeers,
      expiresAt: new Date(Date.now() + dto.expiresInMinutes * 60_000),
    });
    const runtime = collaborationRuntime.create(share.id);
    const { collaborationSessionManager } = await import('./CollaborationSessionManager.js');
    await collaborationSessionManager.startHost(share.id);
    await collaborationRepository.appendAudit({
      workspaceId, shareId: share.id, eventType: 'share.started',
      metadata: { role: share.defaultRole, maxPeers: share.maxPeers, expiresAt: share.expiresAt },
    });
    return { share, ...this.inviteLinks(share.id, runtime.pairingSecret) };
  }

  async invite(workspaceId: string, shareId: string): Promise<{ inviteUri: string; webInviteUri: string }> {
    const share = await collaborationRepository.findShare(shareId);
    const runtime = collaborationRuntime.get(shareId);
    if (!share || share.workspaceId !== workspaceId || share.status !== 'active' || !runtime?.pairingSecret) {
      throw new Error('INVITE_UNAVAILABLE');
    }
    return this.inviteLinks(share.id, runtime.pairingSecret);
  }

  async requestDevice(shareId: string, input: CollaborationJoinRequestInput) {
    const share = await collaborationRepository.findShare(shareId);
    const runtime = collaborationRuntime.get(shareId);
    if (!share || !runtime || share.status !== 'active' || new Date(share.expiresAt).getTime() <= Date.now()) {
      throw new Error('SHARE_EXPIRED');
    }
    const devices = await collaborationRepository.listDevices(share.id);
    if (devices.filter((device) => device.approvedAt && !device.revokedAt).length >= share.maxPeers) throw new Error('SHARE_FULL');
    const fingerprint = createHash('sha256')
      .update(`${share.id}:${input.deviceId}:${input.guestNonce}`)
      .digest('hex')
      .match(/.{1,4}/g)!
      .slice(0, 4)
      .join('-')
      .toUpperCase();
    const device = await collaborationRepository.requestDevice({
      shareId, workspaceId: share.workspaceId, deviceId: input.deviceId,
      displayName: input.displayName, platform: input.platform, fingerprint,
      role: share.defaultRole,
    });
    runtime.pendingPeers.set(input.deviceId, {
      peerId: input.deviceId,
      deviceRecordId: device.id,
      guestNonce: input.guestNonce,
      requestedAt: Date.now(),
    });
    await collaborationRepository.appendAudit({
      workspaceId: share.workspaceId, shareId, actorDeviceId: input.deviceId,
      eventType: 'device.requested', metadata: {
        platform: input.platform,
        requestedRole: input.requestedRole,
        offeredRole: share.defaultRole,
        fingerprint,
      },
    });
    return device;
  }

  async approve(workspaceId: string, shareId: string, deviceId: string, dto: ApproveCollaborationDeviceDto) {
    const [share, device] = await Promise.all([
      collaborationRepository.findShare(shareId), collaborationRepository.findDevice(deviceId),
    ]);
    if (!share || share.workspaceId !== workspaceId || !device || device.shareId !== shareId) throw new Error('DEVICE_NOT_FOUND');
    if (!dto.approved) {
      await collaborationRepository.revokeDevice(device.id);
      collaborationRuntime.get(shareId)?.pendingPeers.delete(device.deviceId);
      await collaborationRepository.appendAudit({
        workspaceId, shareId, actorDeviceId: device.deviceId, eventType: 'device.rejected', metadata: { fingerprint: device.fingerprint },
      });
      const { collaborationSessionManager } = await import('./CollaborationSessionManager.js');
      await collaborationSessionManager.rejectPeer(shareId, device.id, 'denied');
      return { ...device, revokedAt: new Date().toISOString() };
    }
    const approved = await collaborationRepository.approveDevice(
      device.id,
      dto.role,
      collaborationPolicy.scopesForApproval(dto.role, dto.terminalAccess),
    );
    await collaborationRepository.appendAudit({
      workspaceId, shareId, actorDeviceId: device.deviceId, eventType: 'device.approved',
      metadata: { role: approved.role, scopes: approved.scopes, fingerprint: approved.fingerprint },
    });
    const { collaborationSessionManager } = await import('./CollaborationSessionManager.js');
    await collaborationSessionManager.approvePeer(shareId, approved.id);
    return approved;
  }

  async revoke(workspaceId: string, shareId: string, deviceId: string): Promise<void> {
    const [share, device] = await Promise.all([
      collaborationRepository.findShare(shareId), collaborationRepository.findDevice(deviceId),
    ]);
    if (!share || share.workspaceId !== workspaceId || !device || device.shareId !== shareId) throw new Error('DEVICE_NOT_FOUND');
    await collaborationRepository.revokeDevice(device.id);
    collaborationRuntime.get(shareId)?.pendingPeers.delete(device.deviceId);
    await collaborationRepository.appendAudit({
      workspaceId, shareId, actorDeviceId: device.deviceId, eventType: 'device.revoked', metadata: { fingerprint: device.fingerprint },
    });
    const { collaborationSessionManager } = await import('./CollaborationSessionManager.js');
    await collaborationSessionManager.rejectPeer(shareId, device.id, 'revoked');
  }

  async stop(shareId: string, status: 'stopped' | 'expired' = 'stopped'): Promise<void> {
    const share = await collaborationRepository.findShare(shareId);
    if (!share || share.status !== 'active') return;
    const { collaborationSessionManager } = await import('./CollaborationSessionManager.js');
    collaborationSessionManager.stopHost(shareId, status === 'expired' ? 'expired' : 'revoked');
    collaborationRuntime.remove(shareId);
    await collaborationRepository.stopShare(shareId, status);
    await collaborationRepository.appendAudit({
      workspaceId: share.workspaceId, shareId, eventType: status === 'expired' ? 'share.expired' : 'share.stopped', metadata: {},
    });
  }

  private assertRelayUrl(value: string): void {
    const url = new URL(value);
    if (url.protocol === 'wss:') return;
    if (url.protocol === 'ws:' && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) return;
    throw new Error('COLLABORATION_RELAY_MUST_USE_WSS');
  }

  private inviteLinks(shareId: string, pairingSecret: string): { inviteUri: string; webInviteUri: string } {
    return {
      inviteUri: createInviteUri(shareId, pairingSecret),
      webInviteUri: createWebInviteUri(process.env.ORKESTRAI_REMOTE_URL ?? 'https://remote.orkestrai.app', shareId, pairingSecret),
    };
  }
}

export const collaborationShareService = new CollaborationShareService();
