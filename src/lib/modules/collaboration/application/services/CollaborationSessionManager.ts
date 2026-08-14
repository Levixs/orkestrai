import { createHash } from 'node:crypto';
import WebSocket from 'ws';
import { uuidv7 } from '@beeblock/svelar/support';
import {
  COLLABORATION_PROTOCOL,
  SecureCollaborationChannel,
  collaborationEnvelopeSchema,
  derivePairingMaterial,
  deriveSessionMaterial,
  generateHandshakeNonce,
  parseInviteUri,
  type CollaborationEnvelope,
  type CollaborationMessage,
} from '@orkestrai/collaboration-protocol';
import type { CollaborationCommand, CollaborationCommandResult, SharedWorkspaceDto } from '../../domain/types.js';
import { collaborationRepository } from '../../infrastructure/repositories/CollaborationRepository.js';
import { sharedWorkspaceQuery } from '../queries/SharedWorkspaceQuery.js';
import { ExecuteCollaborationCommandDto } from '../dto/CollaborationDto.js';
import { sharedWorkspaceCommandBus } from './SharedWorkspaceCommandBus.js';
import { collaborationRuntime } from './CollaborationRuntime.js';
import { withCollaborationShareLock } from './CollaborationShareLock.js';

type HostPeer = {
  peerId: string;
  deviceRecordId: string;
  guestNonce: string;
  pairingSecret: string;
  pairingChannel: SecureCollaborationChannel;
  sessionChannel: SecureCollaborationChannel | null;
};

type HostSession = {
  shareId: string;
  workspaceId: string;
  relayUrl: string;
  socket: WebSocket | null;
  peers: Map<string, HostPeer>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
  lastProjectionHash: string | null;
  projectionTimer: ReturnType<typeof setInterval> | null;
  transportState: 'connecting' | 'connected' | 'reconnecting' | 'offline';
};

export type RemoteCollaborationState = {
  status: 'idle' | 'connecting' | 'waiting_approval' | 'connected' | 'reconnecting' | 'rejected' | 'expired' | 'offline' | 'incompatible' | 'revoked' | 'error';
  shareId: string | null;
  hostDeviceId: string | null;
  deviceId: string | null;
  displayName: string | null;
  role: string | null;
  scopes: string[];
  revision: number;
  snapshot: SharedWorkspaceDto | null;
  errorCode: string | null;
};

type GuestSession = {
  shareId: string;
  pairingSecret: string;
  relayUrl: string;
  deviceId: string;
  displayName: string;
  platform: 'darwin' | 'win32' | 'linux';
  guestNonce: string;
  hostDeviceId: string | null;
  socket: WebSocket | null;
  pairingChannel: SecureCollaborationChannel | null;
  sessionChannel: SecureCollaborationChannel | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
  state: RemoteCollaborationState;
  commands: Map<string, { resolve: (value: CollaborationCommandResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>;
};

type ManagerState = { hosts: Map<string, HostSession>; guest: GuestSession | null };
const globalKey = Symbol.for('orkestrai.collaborationSessionManager');
const globals = globalThis as typeof globalThis & { [globalKey]?: ManagerState };
const managerState = globals[globalKey] ??= { hosts: new Map(), guest: null };

function websocketDataText(data: WebSocket.RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

export class CollaborationSessionManager {
  async startHost(shareId: string): Promise<void> {
    const share = await collaborationRepository.findShare(shareId);
    if (!share || share.status !== 'active') throw new Error('SHARE_NOT_FOUND');
    if (!collaborationRuntime.get(shareId)) collaborationRuntime.create(shareId);
    const existing = managerState.hosts.get(shareId);
    if (existing) this.stopHost(shareId);
    const host: HostSession = {
      shareId, workspaceId: share.workspaceId, relayUrl: share.relayUrl,
      socket: null, peers: new Map(), reconnectTimer: null, stopped: false,
      lastProjectionHash: null, projectionTimer: null,
      transportState: 'connecting',
    };
    managerState.hosts.set(shareId, host);
    this.connectHost(host);
    host.projectionTimer = setInterval(() => void this.publishChangedSnapshot(host).catch(() => undefined), 5_000);
    host.projectionTimer.unref?.();
  }

  stopHost(shareId: string, reason: 'revoked' | 'expired' = 'revoked'): void {
    const host = managerState.hosts.get(shareId);
    if (!host) return;
    host.stopped = true;
    if (host.reconnectTimer) clearTimeout(host.reconnectTimer);
    if (host.projectionTimer) clearInterval(host.projectionTimer);
    for (const peer of host.peers.values()) {
      try {
        this.send(host.socket, peer.pairingChannel.encrypt({ type: 'join.rejected', reason }, peer.peerId));
      } catch {
        // A closed or partially paired peer has no access left to revoke.
      }
    }
    host.socket?.close(1000, 'Sharing stopped.');
    host.peers.clear();
    managerState.hosts.delete(shareId);
  }

  async approvePeer(shareId: string, deviceRecordId: string): Promise<void> {
    const host = managerState.hosts.get(shareId);
    const runtime = collaborationRuntime.get(shareId);
    const device = await collaborationRepository.findDevice(deviceRecordId);
    if (!host || !runtime || !device?.approvedAt || device.revokedAt) return;
    const peer = [...host.peers.values()].find((candidate) => candidate.deviceRecordId === deviceRecordId);
    if (!peer) return;
    const sessionId = `session_${uuidv7().replaceAll('-', '_')}`;
    this.send(host.socket, peer.pairingChannel.encrypt({
      type: 'join.approved',
      sessionId,
      hostNonce: runtime.hostNonce,
      role: device.role,
      scopes: device.scopes,
      workspace: { name: (await sharedWorkspaceQuery.snapshot(shareId)).workspace.name, icon: null },
    }, peer.peerId));
    const sessionMaterial = deriveSessionMaterial({
      pairingSecret: peer.pairingSecret, shareId, sessionId,
      hostNonce: runtime.hostNonce, guestNonce: peer.guestNonce,
    });
    peer.sessionChannel = new SecureCollaborationChannel({
      role: 'host', shareId, localDeviceId: runtime.hostDeviceId, remoteDeviceId: peer.peerId, material: sessionMaterial,
    });
    await this.sendSnapshot(host, peer);
    collaborationRuntime.rotatePairing(shareId);
  }

  hostStatus(shareId: string): { state: HostSession['transportState']; connectedPeers: number } {
    const host = managerState.hosts.get(shareId);
    return host
      ? { state: host.transportState, connectedPeers: [...host.peers.values()].filter((peer) => peer.sessionChannel).length }
      : { state: 'offline', connectedPeers: 0 };
  }

  async rejectPeer(shareId: string, deviceRecordId: string, reason: 'denied' | 'revoked' = 'denied'): Promise<void> {
    const host = managerState.hosts.get(shareId);
    const peer = host ? [...host.peers.values()].find((candidate) => candidate.deviceRecordId === deviceRecordId) : null;
    if (host && peer) {
      this.send(host.socket, peer.pairingChannel.encrypt({ type: 'join.rejected', reason: reason === 'revoked' ? 'revoked' : 'denied' }, peer.peerId));
      peer.sessionChannel = null;
      host.peers.delete(peer.peerId);
    }
    if (collaborationRuntime.get(shareId)) collaborationRuntime.rotatePairing(shareId);
  }

  async join(input: {
    inviteUri: string; relayUrl: string; displayName: string; platform: 'darwin' | 'win32' | 'linux';
  }): Promise<RemoteCollaborationState> {
    this.leaveGuest();
    const invite = parseInviteUri(input.inviteUri);
    this.assertRelayUrl(input.relayUrl);
    const guestNonce = generateHandshakeNonce();
    const deviceId = `guest_${uuidv7().replaceAll('-', '_')}`;
    const guest: GuestSession = {
      shareId: invite.shareId, pairingSecret: invite.pairingSecret, relayUrl: input.relayUrl,
      deviceId, displayName: input.displayName.trim().slice(0, 80), platform: input.platform,
      guestNonce, hostDeviceId: null, socket: null, pairingChannel: null, sessionChannel: null,
      reconnectTimer: null, stopped: false, commands: new Map(),
      state: {
        status: 'connecting', shareId: invite.shareId, hostDeviceId: null, deviceId,
        displayName: input.displayName.trim().slice(0, 80), role: null, scopes: [], revision: 0,
        snapshot: null, errorCode: null,
      },
    };
    managerState.guest = guest;
    this.connectGuest(guest);
    return guest.state;
  }

  guestStatus(): RemoteCollaborationState {
    return managerState.guest?.state ?? {
      status: 'idle', shareId: null, hostDeviceId: null, deviceId: null, displayName: null,
      role: null, scopes: [], revision: 0, snapshot: null, errorCode: null,
    };
  }

  leaveGuest(): void {
    const guest = managerState.guest;
    if (!guest) return;
    guest.stopped = true;
    if (guest.reconnectTimer) clearTimeout(guest.reconnectTimer);
    guest.socket?.close(1000, 'Guest left.');
    for (const pending of guest.commands.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Remote workspace disconnected.'));
    }
    guest.commands.clear();
    guest.pairingSecret = '';
    guest.pairingChannel = null;
    guest.sessionChannel = null;
    managerState.guest = null;
  }

  async sendGuestCommand(command: CollaborationCommand): Promise<CollaborationCommandResult> {
    const guest = managerState.guest;
    if (!guest?.sessionChannel || !guest.socket || guest.socket.readyState !== WebSocket.OPEN) throw new Error('REMOTE_WORKSPACE_OFFLINE');
    const commandId = `command_${uuidv7().replaceAll('-', '_')}`;
    const message: CollaborationMessage = { type: 'command', commandId, revision: guest.state.revision, command };
    const result = new Promise<CollaborationCommandResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        guest.commands.delete(commandId);
        reject(new Error('REMOTE_COMMAND_TIMEOUT'));
      }, 20_000);
      timer.unref?.();
      guest.commands.set(commandId, { resolve, reject, timer });
    });
    this.send(guest.socket, guest.sessionChannel.encrypt(message, guest.hostDeviceId));
    return result;
  }

  shutdown(): void {
    for (const shareId of [...managerState.hosts.keys()]) this.stopHost(shareId);
    this.leaveGuest();
  }

  private connectHost(host: HostSession): void {
    const runtime = collaborationRuntime.get(host.shareId);
    if (!runtime || host.stopped) return;
    const socket = new WebSocket(this.relayConnectionUrl(host.relayUrl, host.shareId, runtime.hostDeviceId, 'host'), COLLABORATION_PROTOCOL, { perMessageDeflate: false });
    host.socket = socket;
    socket.on('open', () => { host.transportState = 'connected'; });
    socket.on('message', (data) => void this.handleHostMessage(host, websocketDataText(data)).catch(() => undefined));
    socket.on('close', () => {
      host.socket = null;
      host.transportState = host.stopped ? 'offline' : 'reconnecting';
      for (const peer of host.peers.values()) peer.sessionChannel = null;
      if (!host.stopped) host.reconnectTimer = setTimeout(() => this.connectHost(host), 2_000);
    });
    socket.on('error', () => undefined);
  }

  private async handleHostMessage(host: HostSession, raw: string): Promise<void> {
    const envelope = collaborationEnvelopeSchema.parse(JSON.parse(raw)) as CollaborationEnvelope;
    let peer = host.peers.get(envelope.senderDeviceId);
    if (!peer) {
      const runtime = collaborationRuntime.get(host.shareId);
      if (!runtime?.pairingSecret) return;
      peer = {
        peerId: envelope.senderDeviceId, deviceRecordId: '', guestNonce: '',
        pairingSecret: runtime.pairingSecret,
        pairingChannel: new SecureCollaborationChannel({
          role: 'host', shareId: host.shareId, localDeviceId: runtime.hostDeviceId,
          remoteDeviceId: envelope.senderDeviceId,
          material: derivePairingMaterial({ pairingSecret: runtime.pairingSecret, shareId: host.shareId }),
        }),
        sessionChannel: null,
      };
      host.peers.set(peer.peerId, peer);
    }
    if (envelope.keyId === peer.pairingChannel.keyId && envelope.sequence === 1 && peer.pairingChannel.receivedSequence > 0) {
      const runtime = collaborationRuntime.get(host.shareId);
      if (!runtime) return;
      peer.pairingChannel = new SecureCollaborationChannel({
        role: 'host', shareId: host.shareId, localDeviceId: runtime.hostDeviceId,
        remoteDeviceId: peer.peerId,
        material: derivePairingMaterial({ pairingSecret: peer.pairingSecret, shareId: host.shareId }),
      });
    }
    const message = peer.sessionChannel && envelope.keyId === peer.sessionChannel.keyId
      ? peer.sessionChannel.decrypt(envelope)
      : peer.pairingChannel.decrypt(envelope);
    if (message.type === 'join.request') {
      const existing = await collaborationRepository.findDeviceByPeer(host.shareId, message.deviceId);
      if (existing?.approvedAt && !existing.revokedAt) {
        peer.deviceRecordId = existing.id;
        peer.guestNonce = message.guestNonce;
        await collaborationRepository.touchDevice(existing.id);
        await collaborationRepository.appendAudit({
          workspaceId: host.workspaceId, shareId: host.shareId, actorDeviceId: existing.deviceId,
          eventType: 'device.reconnected', metadata: { fingerprint: existing.fingerprint },
        });
        await this.approvePeer(host.shareId, existing.id);
        return;
      }
      try {
        const { collaborationShareService } = await import('./CollaborationShareService.js');
        const device = await collaborationShareService.requestDevice(host.shareId, message);
        peer.deviceRecordId = device.id;
        peer.guestNonce = message.guestNonce;
      } catch (error) {
        const reason = error instanceof Error && error.message === 'SHARE_FULL' ? 'full' : 'expired';
        this.send(host.socket, peer.pairingChannel.encrypt({ type: 'join.rejected', reason }, peer.peerId));
        host.peers.delete(peer.peerId);
      }
      return;
    }
    if (message.type === 'snapshot.request' && peer.sessionChannel) {
      await this.sendSnapshot(host, peer);
      return;
    }
    if (message.type === 'command' && peer.sessionChannel && peer.deviceRecordId) {
      const result = await sharedWorkspaceCommandBus.execute(host.shareId, peer.deviceRecordId, new ExecuteCollaborationCommandDto(
        message.commandId, message.revision, message.command as CollaborationCommand,
      ));
      this.send(host.socket, peer.sessionChannel.encrypt({
        type: 'command.result', commandId: result.commandId, accepted: result.accepted,
        revision: result.revision, ...(result.errorCode ? { errorCode: result.errorCode } : {}),
      }, peer.peerId));
      if (result.accepted) await this.sendSnapshot(host, peer);
    }
  }

  private connectGuest(guest: GuestSession): void {
    if (guest.stopped) return;
    guest.state = { ...guest.state, status: guest.state.status === 'connecting' ? 'connecting' : 'reconnecting', errorCode: null };
    const socket = new WebSocket(this.relayConnectionUrl(guest.relayUrl, guest.shareId, guest.deviceId, 'guest'), COLLABORATION_PROTOCOL, { perMessageDeflate: false });
    guest.socket = socket;
    socket.on('open', () => {
      guest.state = { ...guest.state, status: 'waiting_approval' };
      guest.pairingChannel = null;
      guest.sessionChannel = null;
      // The host identity is learned from its first authenticated response.
      const material = derivePairingMaterial({ pairingSecret: guest.pairingSecret, shareId: guest.shareId });
      const provisionalHost = `pending_${guest.shareId}`.slice(0, 128);
      guest.pairingChannel = new SecureCollaborationChannel({
        role: 'guest', shareId: guest.shareId, localDeviceId: guest.deviceId,
        remoteDeviceId: provisionalHost, material,
      });
      this.send(socket, guest.pairingChannel.encrypt({
        type: 'join.request', deviceId: guest.deviceId, displayName: guest.displayName,
        platform: guest.platform, requestedRole: 'viewer', guestNonce: guest.guestNonce,
        appVersion: process.env.npm_package_version ?? '0.0.0',
      }));
    });
    socket.on('message', (data) => void this.handleGuestMessage(guest, websocketDataText(data)).catch((error) => {
      guest.state = { ...guest.state, status: 'error', errorCode: error instanceof Error ? error.message : 'REMOTE_PROTOCOL_ERROR' };
    }));
    socket.on('close', () => {
      guest.socket = null;
      if (!guest.stopped && !['rejected', 'revoked', 'expired'].includes(guest.state.status)) {
        guest.state = { ...guest.state, status: 'reconnecting' };
        guest.reconnectTimer = setTimeout(() => this.connectGuest(guest), 2_000);
      }
    });
    socket.on('error', () => undefined);
  }

  private async handleGuestMessage(guest: GuestSession, raw: string): Promise<void> {
    const envelope = collaborationEnvelopeSchema.parse(JSON.parse(raw)) as CollaborationEnvelope;
    if (!guest.hostDeviceId) {
      const hostDeviceId = String(envelope.senderDeviceId);
      guest.hostDeviceId = hostDeviceId;
      guest.pairingChannel = new SecureCollaborationChannel({
        role: 'guest', shareId: guest.shareId, localDeviceId: guest.deviceId,
        remoteDeviceId: hostDeviceId,
        material: derivePairingMaterial({ pairingSecret: guest.pairingSecret, shareId: guest.shareId }),
      });
      guest.state = { ...guest.state, hostDeviceId: guest.hostDeviceId };
    }
    const message = guest.sessionChannel && envelope.keyId === guest.sessionChannel.keyId
      ? guest.sessionChannel.decrypt(envelope)
      : guest.pairingChannel!.decrypt(envelope);
    if (message.type === 'join.rejected') {
      const status = message.reason === 'expired' ? 'expired' : message.reason === 'incompatible' ? 'incompatible' : message.reason === 'revoked' ? 'revoked' : 'rejected';
      guest.state = { ...guest.state, status, errorCode: message.reason };
      return;
    }
    if (message.type === 'join.approved') {
      const material = deriveSessionMaterial({
        pairingSecret: guest.pairingSecret, shareId: guest.shareId, sessionId: message.sessionId,
        hostNonce: message.hostNonce, guestNonce: guest.guestNonce,
      });
      guest.sessionChannel = new SecureCollaborationChannel({
        role: 'guest', shareId: guest.shareId, localDeviceId: guest.deviceId,
        remoteDeviceId: guest.hostDeviceId!, material,
      });
      guest.state = { ...guest.state, status: 'connected', role: message.role, scopes: message.scopes, errorCode: null };
      this.send(guest.socket, guest.sessionChannel.encrypt({ type: 'snapshot.request' }, guest.hostDeviceId));
      return;
    }
    if (message.type === 'snapshot') {
      guest.state = { ...guest.state, status: 'connected', revision: message.revision, snapshot: message.workspace as SharedWorkspaceDto, errorCode: null };
      return;
    }
    if (message.type === 'command.result') {
      const pending = guest.commands.get(message.commandId);
      if (!pending) return;
      clearTimeout(pending.timer);
      guest.commands.delete(message.commandId);
      pending.resolve({ commandId: message.commandId, accepted: message.accepted, revision: message.revision, result: null, errorCode: message.errorCode ?? null });
    }
  }

  private async sendSnapshot(host: HostSession, peer: HostPeer): Promise<void> {
    if (!peer.sessionChannel) return;
    const snapshot = await sharedWorkspaceQuery.snapshot(host.shareId);
    this.send(host.socket, peer.sessionChannel.encrypt({ type: 'snapshot', revision: snapshot.revision, workspace: snapshot }, peer.peerId));
    host.lastProjectionHash = this.projectionHash(snapshot);
  }

  private async publishChangedSnapshot(host: HostSession): Promise<void> {
    if (!host.socket || host.socket.readyState !== WebSocket.OPEN || ![...host.peers.values()].some((peer) => peer.sessionChannel)) return;
    await withCollaborationShareLock(host.shareId, async () => {
      let snapshot = await sharedWorkspaceQuery.snapshot(host.shareId);
      const hash = this.projectionHash(snapshot);
      if (host.lastProjectionHash === hash) return;
      const revision = await collaborationRepository.incrementRevision(host.shareId);
      snapshot = { ...snapshot, revision };
      host.lastProjectionHash = this.projectionHash(snapshot);
      for (const peer of host.peers.values()) {
        if (peer.sessionChannel) this.send(host.socket, peer.sessionChannel.encrypt({ type: 'snapshot', revision, workspace: snapshot }, peer.peerId));
      }
    });
  }

  private projectionHash(snapshot: SharedWorkspaceDto): string {
    return createHash('sha256').update(JSON.stringify({ ...snapshot, generatedAt: null, revision: 0 })).digest('hex');
  }

  private send(socket: WebSocket | null, envelope: CollaborationEnvelope): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('COLLABORATION_TRANSPORT_OFFLINE');
    socket.send(JSON.stringify(envelope), { compress: false });
  }

  private relayConnectionUrl(relayUrl: string, shareId: string, peerId: string, role: 'host' | 'guest'): string {
    const url = new URL(relayUrl);
    url.searchParams.set('share', shareId);
    url.searchParams.set('peer', peerId);
    url.searchParams.set('role', role);
    return url.toString();
  }

  private assertRelayUrl(value: string): void {
    const url = new URL(value);
    if (url.protocol === 'wss:') return;
    if (url.protocol === 'ws:' && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) return;
    throw new Error('COLLABORATION_RELAY_MUST_USE_WSS');
  }
}

export const collaborationSessionManager = new CollaborationSessionManager();

const shutdown = globalThis as typeof globalThis & { __orkestraiShutdownCollaboration?: () => Promise<void> };
shutdown.__orkestraiShutdownCollaboration = async () => collaborationSessionManager.shutdown();
