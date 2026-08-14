import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { uuidv7 } from '@beeblock/svelar/support';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { taskBoardService } from '$lib/modules/agent-room/application/services/TaskBoardService.js';
import { collaborationRepository } from '$lib/modules/collaboration/infrastructure/repositories/CollaborationRepository.js';
import { collaborationPolicy } from '$lib/modules/collaboration/domain/policies/CollaborationPolicy.js';
import { sharedWorkspaceQuery } from '$lib/modules/collaboration/application/queries/SharedWorkspaceQuery.js';
import { fitSharedWorkspaceSnapshot, MAX_SHARED_SNAPSHOT_BYTES } from '$lib/modules/collaboration/application/queries/SharedWorkspaceQuery.js';
import { sharedWorkspaceCommandBus } from '$lib/modules/collaboration/application/services/SharedWorkspaceCommandBus.js';
import { collaborationRuntime } from '$lib/modules/collaboration/application/services/CollaborationRuntime.js';
import { collaborationShareService } from '$lib/modules/collaboration/application/services/CollaborationShareService.js';
import { CreateCollaborationShareRequest } from '$lib/modules/collaboration/interface/http/requests/CreateCollaborationShareRequest.js';
import { ApproveCollaborationDeviceRequest } from '$lib/modules/collaboration/interface/http/requests/ApproveCollaborationDeviceRequest.js';
import { ExecuteCollaborationCommandDto } from '$lib/modules/collaboration/application/dto/CollaborationDto.js';

async function setup(role: 'viewer' | 'operator' = 'operator') {
  const workingDir = mkdtempSync(join(tmpdir(), 'orkestrai-collaboration-'));
  const workspace = await workspaceRepository.createWorkspace({
    name: 'Shared workspace',
    workingDir,
    instructions: 'Never expose ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 or /Users/host/private.',
  });
  const agent = await workspaceRepository.createNode({
    workspaceId: workspace.id,
    type: 'terminal',
    title: 'Leader /Users/host/private',
    x: 120,
    y: 80,
    payload: {
      provider: 'claude', role: 'Lead', maestro: true,
      sessionId: 'secret-session', env: { API_KEY: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' },
    },
  });
  await workspaceRepository.createNode({
    workspaceId: workspace.id,
    type: 'portal',
    title: 'Private portal',
    payload: { url: 'http://127.0.0.1:3000', token: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' },
  });
  await taskBoardService.create(workspace.id, {
    title: 'Check /Users/host/private/file.ts',
    description: 'Use ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 at http://localhost:3000.',
    assigneeNodeId: agent.id,
    createdBy: 'collaboration-test',
  });
  const share = await collaborationRepository.createShare({
    workspaceId: workspace.id,
    defaultRole: role,
    relayUrl: 'wss://relay.example.test/v1/connect',
    maxPeers: 5,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const device = await collaborationRepository.requestDevice({
    shareId: share.id,
    workspaceId: workspace.id,
    deviceId: `device_${role}_01`,
    displayName: 'Remote reviewer',
    platform: 'darwin',
    fingerprint: 'AAAA-BBBB-CCCC-DDDD',
    role,
  });
  const approved = await collaborationRepository.approveDevice(device.id, role, collaborationPolicy.scopesForRole(role));
  return { workspace, share, device: approved };
}

describe('collaboration host core', () => {
  useSvelarTest({ refreshDatabase: true });

  it('projects only allowlisted workspace data and redacts paths, secrets, and private URLs', async () => {
    const { share } = await setup();
    const snapshot = await sharedWorkspaceQuery.snapshot(share.id);
    const serialized = JSON.stringify(snapshot);
    expect(snapshot.nodes.some((node) => node.type === 'agent')).toBe(true);
    expect(snapshot.nodes.some((node) => (node.type as string) === 'portal')).toBe(false);
    expect(serialized).not.toContain('secret-session');
    expect(serialized).not.toContain('API_KEY');
    expect(serialized).not.toContain('/Users/host/private');
    expect(serialized).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456');
    expect(serialized).not.toContain('http://localhost:3000');
    expect(serialized).toContain('[redacted-path]');
    expect(serialized).toContain('[redacted-secret]');
    expect(serialized).toContain('[redacted-private-url]');
  });

  it('enforces scope, revision, and command idempotency before mutating tasks', async () => {
    const operator = await setup('operator');
    const commandId = `command_${uuidv7().replaceAll('-', '_')}`;
    const command = new ExecuteCollaborationCommandDto(commandId, 0, {
      type: 'task.create', title: 'Remote task', description: 'Traceable remote mutation',
    });
    const accepted = await sharedWorkspaceCommandBus.execute(operator.share.id, operator.device.id, command);
    expect(accepted).toMatchObject({ accepted: true, revision: 1, errorCode: null });
    const replay = await sharedWorkspaceCommandBus.execute(operator.share.id, operator.device.id, command);
    expect(replay).toEqual(accepted);
    expect((await taskBoardService.list(operator.workspace.id)).filter((task) => task.title === 'Remote task')).toHaveLength(1);

    const stale = await sharedWorkspaceCommandBus.execute(operator.share.id, operator.device.id, new ExecuteCollaborationCommandDto(
      `command_${uuidv7().replaceAll('-', '_')}`, 0, { type: 'task.create', title: 'Stale task' },
    ));
    expect(stale).toMatchObject({ accepted: false, errorCode: 'REVISION_CONFLICT', revision: 1 });

    const viewer = await setup('viewer');
    const denied = await sharedWorkspaceCommandBus.execute(viewer.share.id, viewer.device.id, new ExecuteCollaborationCommandDto(
      `command_${uuidv7().replaceAll('-', '_')}`, 0, { type: 'task.create', title: 'Forbidden task' },
    ));
    expect(denied).toMatchObject({ accepted: false, errorCode: 'SCOPE_DENIED' });
    expect((await taskBoardService.list(viewer.workspace.id)).some((task) => task.title === 'Forbidden task')).toBe(false);
    expect((await collaborationRepository.listAudit(operator.workspace.id)).some((event) => event.eventType === 'command.accepted')).toBe(true);
    expect((await collaborationRepository.listAudit(viewer.workspace.id)).some((event) => event.eventType === 'command.rejected')).toBe(true);
  });

  it('fits large sanitized projections within the encrypted frame budget', async () => {
    const { share } = await setup();
    const snapshot = await sharedWorkspaceQuery.snapshot(share.id);
    const oversized = {
      ...snapshot,
      tasks: Array.from({ length: 200 }, (_, index) => ({
        ...snapshot.tasks[0],
        id: uuidv7(),
        title: `Large task ${index}`,
        description: 'safe context '.repeat(4_000),
      })),
    };
    const fitted = fitSharedWorkspaceSnapshot(oversized);
    expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(MAX_SHARED_SNAPSHOT_BYTES);
    expect(fitted.tasks.length).toBeLessThan(oversized.tasks.length);
  });

  it('offers the host default role instead of trusting a guest request', async () => {
    const { share } = await setup('operator');
    collaborationRuntime.create(share.id);
    try {
      const requested = await collaborationShareService.requestDevice(share.id, {
        deviceId: 'guest_default_role',
        displayName: 'Remote guest',
        platform: 'linux',
        requestedRole: 'viewer',
        guestNonce: 'a'.repeat(43),
        appVersion: '0.0.0',
      });
      expect(requested.role).toBe('operator');
    } finally {
      collaborationRuntime.remove(share.id);
    }
  });

  it('validates strict request bodies together with Svelar route parameters', async () => {
    const workspaceId = uuidv7();
    const shareId = uuidv7();
    const deviceId = uuidv7();
    const create = await CreateCollaborationShareRequest.validate({
      params: { id: workspaceId },
      url: new URL(`http://localhost/workspaces/${workspaceId}/collaboration`),
      request: new Request('http://localhost/collaboration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          defaultRole: 'collaborator',
          expiresInMinutes: 30,
          maxPeers: 3,
          relayUrl: 'wss://relay.example.test/v1/connect',
        }),
      }),
    } as never);
    expect(create).toEqual({
      defaultRole: 'collaborator',
      expiresInMinutes: 30,
      maxPeers: 3,
      relayUrl: 'wss://relay.example.test/v1/connect',
    });

    const approval = await ApproveCollaborationDeviceRequest.validate({
      params: { id: workspaceId, shareId, deviceId },
      url: new URL(`http://localhost/workspaces/${workspaceId}/collaboration/${shareId}/devices/${deviceId}`),
      request: new Request('http://localhost/collaboration-device', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved: true, role: 'operator' }),
      }),
    } as never);
    expect(approval).toEqual({ approved: true, role: 'operator' });
  });
});
