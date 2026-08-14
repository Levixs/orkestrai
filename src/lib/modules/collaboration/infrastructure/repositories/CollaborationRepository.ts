import { uuidv7 } from '@beeblock/svelar/support';
import type {
  CollaborationAuditData,
  CollaborationDeviceData,
  CollaborationRole,
  CollaborationScope,
  CollaborationShareData,
} from '../../domain/types.js';
import { CollaborationAuditEvent } from '../../domain/models/CollaborationAuditEvent.js';
import { CollaborationCommand } from '../../domain/models/CollaborationCommand.js';
import { CollaborationDevice } from '../../domain/models/CollaborationDevice.js';
import { CollaborationShare } from '../../domain/models/CollaborationShare.js';
import { sanitizeAuditMetadata } from '../../application/projections/sanitize-shared-data.js';

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function optionalIso(value: unknown): string | null {
  return value ? iso(value) : null;
}

function parseObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = value ? JSON.parse(String(value)) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseScopes(value: unknown): CollaborationScope[] {
  try {
    const parsed = value ? JSON.parse(String(value)) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is CollaborationScope => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function shareData(model: CollaborationShare): CollaborationShareData {
  return {
    id: String(model.getAttribute('id')),
    workspaceId: String(model.getAttribute('workspace_id')),
    status: model.getAttribute('status') as CollaborationShareData['status'],
    defaultRole: model.getAttribute('default_role') as CollaborationRole,
    relayUrl: String(model.getAttribute('relay_url')),
    relayRegion: model.getAttribute('relay_region') ? String(model.getAttribute('relay_region')) : null,
    maxPeers: Number(model.getAttribute('max_peers')),
    revision: Number(model.getAttribute('revision') ?? 0),
    expiresAt: iso(model.getAttribute('expires_at')),
    startedAt: iso(model.getAttribute('started_at')),
    stoppedAt: optionalIso(model.getAttribute('stopped_at')),
    createdAt: iso(model.getAttribute('created_at')),
    updatedAt: iso(model.getAttribute('updated_at')),
  };
}

function deviceData(model: CollaborationDevice): CollaborationDeviceData {
  return {
    id: String(model.getAttribute('id')),
    shareId: String(model.getAttribute('share_id')),
    workspaceId: String(model.getAttribute('workspace_id')),
    deviceId: String(model.getAttribute('device_id')),
    displayName: String(model.getAttribute('display_name')),
    platform: model.getAttribute('platform') as CollaborationDeviceData['platform'],
    fingerprint: String(model.getAttribute('fingerprint')),
    role: model.getAttribute('role') as CollaborationRole,
    scopes: parseScopes(model.getAttribute('scopes_json')),
    requestedAt: iso(model.getAttribute('requested_at')),
    approvedAt: optionalIso(model.getAttribute('approved_at')),
    lastSeenAt: optionalIso(model.getAttribute('last_seen_at')),
    revokedAt: optionalIso(model.getAttribute('revoked_at')),
  };
}

export class CollaborationRepository {
  async createShare(input: {
    workspaceId: string; defaultRole: CollaborationRole; relayUrl: string;
    maxPeers: number; expiresAt: Date;
  }): Promise<CollaborationShareData> {
    const now = new Date();
    const model = await CollaborationShare.create({
      id: uuidv7(), workspace_id: input.workspaceId, status: 'active',
      default_role: input.defaultRole, relay_url: input.relayUrl, relay_region: null,
      max_peers: input.maxPeers, revision: 0, expires_at: input.expiresAt,
      started_at: now, stopped_at: null, created_at: now, updated_at: now,
    });
    return shareData(model);
  }

  async findShare(id: string): Promise<CollaborationShareData | null> {
    const model = await CollaborationShare.find(id);
    return model ? shareData(model) : null;
  }

  async activeShare(workspaceId: string): Promise<CollaborationShareData | null> {
    const model = await CollaborationShare.query()
      .where('workspace_id', workspaceId).where('status', 'active').orderBy('started_at', 'desc').first();
    return model ? shareData(model) : null;
  }

  async activeShares(): Promise<CollaborationShareData[]> {
    const models = await CollaborationShare.query().where('status', 'active').get();
    return models.map(shareData);
  }

  async stopShare(id: string, status: 'stopped' | 'expired' = 'stopped'): Promise<void> {
    const now = new Date();
    await CollaborationShare.query().where('id', id).update({ status, stopped_at: now, updated_at: now });
  }

  async incrementRevision(id: string): Promise<number> {
    const share = await CollaborationShare.find(id);
    if (!share) throw new Error('Collaboration share not found.');
    const revision = Number(share.getAttribute('revision') ?? 0) + 1;
    await CollaborationShare.query().where('id', id).update({ revision, updated_at: new Date() });
    return revision;
  }

  async requestDevice(input: {
    shareId: string; workspaceId: string; deviceId: string; displayName: string;
    platform: CollaborationDeviceData['platform']; fingerprint: string; role: CollaborationRole;
  }): Promise<CollaborationDeviceData> {
    const now = new Date();
    const existing = await CollaborationDevice.query()
      .where('share_id', input.shareId).where('device_id', input.deviceId).first();
    if (existing) {
      await CollaborationDevice.query().where('id', existing.getAttribute('id')).update({
        display_name: input.displayName, platform: input.platform, fingerprint: input.fingerprint,
        role: input.role, requested_at: now, approved_at: null, revoked_at: null, updated_at: now,
      });
      return deviceData((await CollaborationDevice.find(existing.getAttribute('id')))!);
    }
    const model = await CollaborationDevice.create({
      id: uuidv7(), share_id: input.shareId, workspace_id: input.workspaceId,
      device_id: input.deviceId, display_name: input.displayName, platform: input.platform,
      public_key: null, fingerprint: input.fingerprint, role: input.role, scopes_json: '[]',
      requested_at: now, approved_at: null, last_seen_at: null, revoked_at: null,
      created_at: now, updated_at: now,
    });
    return deviceData(model);
  }

  async findDevice(id: string): Promise<CollaborationDeviceData | null> {
    const model = await CollaborationDevice.find(id);
    return model ? deviceData(model) : null;
  }

  async findDeviceByPeer(shareId: string, deviceId: string): Promise<CollaborationDeviceData | null> {
    const model = await CollaborationDevice.query().where('share_id', shareId).where('device_id', deviceId).first();
    return model ? deviceData(model) : null;
  }

  async listDevices(shareId: string): Promise<CollaborationDeviceData[]> {
    const rows = await CollaborationDevice.query().where('share_id', shareId).orderBy('requested_at', 'desc').get();
    return rows.map(deviceData);
  }

  async approveDevice(id: string, role: CollaborationRole, scopes: CollaborationScope[]): Promise<CollaborationDeviceData> {
    const now = new Date();
    await CollaborationDevice.query().where('id', id).update({
      role, scopes_json: JSON.stringify(scopes), approved_at: now, revoked_at: null,
      last_seen_at: now, updated_at: now,
    });
    const model = await CollaborationDevice.find(id);
    if (!model) throw new Error('Collaboration device not found.');
    return deviceData(model);
  }

  async revokeDevice(id: string): Promise<void> {
    const now = new Date();
    await CollaborationDevice.query().where('id', id).update({ revoked_at: now, updated_at: now });
  }

  async touchDevice(id: string): Promise<void> {
    await CollaborationDevice.query().where('id', id).update({ last_seen_at: new Date(), updated_at: new Date() });
  }

  async appendAudit(input: {
    workspaceId: string; shareId?: string | null; actorDeviceId?: string | null;
    eventType: string; metadata?: Record<string, unknown>;
  }): Promise<CollaborationAuditData> {
    const model = await CollaborationAuditEvent.create({
      id: uuidv7(), workspace_id: input.workspaceId, share_id: input.shareId ?? null,
      actor_device_id: input.actorDeviceId ?? null, event_type: input.eventType,
      metadata_json: JSON.stringify(sanitizeAuditMetadata(input.metadata ?? {})), created_at: new Date(),
    });
    return {
      id: String(model.getAttribute('id')),
      workspaceId: String(model.getAttribute('workspace_id')),
      shareId: model.getAttribute('share_id') ? String(model.getAttribute('share_id')) : null,
      actorDeviceId: model.getAttribute('actor_device_id') ? String(model.getAttribute('actor_device_id')) : null,
      eventType: String(model.getAttribute('event_type')),
      metadata: parseObject(model.getAttribute('metadata_json')),
      createdAt: iso(model.getAttribute('created_at')),
    };
  }

  async listAudit(workspaceId: string, limit = 200): Promise<CollaborationAuditData[]> {
    const rows = await CollaborationAuditEvent.query().where('workspace_id', workspaceId)
      .orderBy('created_at', 'desc').limit(limit).get();
    return rows.map((model) => ({
      id: String(model.getAttribute('id')),
      workspaceId: String(model.getAttribute('workspace_id')),
      shareId: model.getAttribute('share_id') ? String(model.getAttribute('share_id')) : null,
      actorDeviceId: model.getAttribute('actor_device_id') ? String(model.getAttribute('actor_device_id')) : null,
      eventType: String(model.getAttribute('event_type')),
      metadata: parseObject(model.getAttribute('metadata_json')),
      createdAt: iso(model.getAttribute('created_at')),
    }));
  }

  async findCommand(id: string): Promise<CollaborationCommandResultRow | null> {
    const model = await CollaborationCommand.find(id);
    return model ? commandData(model) : null;
  }

  async startCommand(input: {
    id: string; shareId: string; workspaceId: string; deviceRecordId: string;
    revision: number; type: string;
  }): Promise<void> {
    await CollaborationCommand.create({
      id: input.id, share_id: input.shareId, workspace_id: input.workspaceId,
      device_record_id: input.deviceRecordId, requested_revision: input.revision,
      result_revision: input.revision, command_type: input.type, status: 'processing',
      result_json: null, error_code: null, created_at: new Date(), completed_at: null,
    });
  }

  async finishCommand(id: string, input: {
    accepted: boolean; revision: number; result?: Record<string, unknown> | null; errorCode?: string | null;
  }): Promise<CollaborationCommandResultRow> {
    await CollaborationCommand.query().where('id', id).update({
      status: input.accepted ? 'accepted' : 'rejected', result_revision: input.revision,
      result_json: input.result ? JSON.stringify(sanitizeAuditMetadata(input.result)) : null,
      error_code: input.errorCode ?? null, completed_at: new Date(),
    });
    const model = await CollaborationCommand.find(id);
    if (!model) throw new Error('Collaboration command result not found.');
    return commandData(model);
  }
}

export type CollaborationCommandResultRow = {
  id: string; shareId: string; workspaceId: string; deviceRecordId: string;
  requestedRevision: number; resultRevision: number; type: string;
  status: 'processing' | 'accepted' | 'rejected'; result: Record<string, unknown> | null;
  errorCode: string | null;
};

function commandData(model: CollaborationCommand): CollaborationCommandResultRow {
  return {
    id: String(model.getAttribute('id')),
    shareId: String(model.getAttribute('share_id')),
    workspaceId: String(model.getAttribute('workspace_id')),
    deviceRecordId: String(model.getAttribute('device_record_id')),
    requestedRevision: Number(model.getAttribute('requested_revision')),
    resultRevision: Number(model.getAttribute('result_revision')),
    type: String(model.getAttribute('command_type')),
    status: model.getAttribute('status') as CollaborationCommandResultRow['status'],
    result: model.getAttribute('result_json') ? parseObject(model.getAttribute('result_json')) : null,
    errorCode: model.getAttribute('error_code') ? String(model.getAttribute('error_code')) : null,
  };
}

export const collaborationRepository = new CollaborationRepository();
