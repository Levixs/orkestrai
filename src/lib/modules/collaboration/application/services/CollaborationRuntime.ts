import { randomBytes } from 'node:crypto';
import { generateHandshakeNonce, generatePairingSecret } from '@orkestrai/collaboration-protocol';

export type PendingCollaborationPeer = {
  peerId: string;
  deviceRecordId: string;
  guestNonce: string;
  requestedAt: number;
};

export type CollaborationShareRuntime = {
  shareId: string;
  pairingSecret: string;
  hostNonce: string;
  hostDeviceId: string;
  pendingPeers: Map<string, PendingCollaborationPeer>;
};

type RuntimeState = { shares: Map<string, CollaborationShareRuntime> };
const key = Symbol.for('orkestrai.collaborationRuntime');
const globals = globalThis as typeof globalThis & { [key]?: RuntimeState };
const state = globals[key] ??= { shares: new Map() };

export class CollaborationRuntime {
  create(shareId: string): CollaborationShareRuntime {
    const runtime = {
      shareId,
      pairingSecret: generatePairingSecret(),
      hostNonce: generateHandshakeNonce(),
      hostDeviceId: `host_${randomBytes(18).toString('base64url')}`,
      pendingPeers: new Map(),
    };
    state.shares.set(shareId, runtime);
    return runtime;
  }

  get(shareId: string): CollaborationShareRuntime | null {
    return state.shares.get(shareId) ?? null;
  }

  rotatePairing(shareId: string): string {
    const runtime = state.shares.get(shareId);
    if (!runtime) throw new Error('Collaboration runtime is unavailable.');
    runtime.pairingSecret = generatePairingSecret();
    runtime.hostNonce = generateHandshakeNonce();
    runtime.pendingPeers.clear();
    return runtime.pairingSecret;
  }

  remove(shareId: string): void {
    const runtime = state.shares.get(shareId);
    if (runtime) {
      runtime.pairingSecret = '';
      runtime.hostNonce = '';
      runtime.pendingPeers.clear();
    }
    state.shares.delete(shareId);
  }
}

export const collaborationRuntime = new CollaborationRuntime();
