import { describe, expect, it } from 'vitest';
import {
  SecureCollaborationChannel,
  createInviteUri,
  deriveSessionMaterial,
  generateHandshakeNonce,
  generatePairingSecret,
  parseInviteUri,
} from '@orkestrai/collaboration-protocol';

function channelPair() {
  const pairingSecret = generatePairingSecret();
  const material = deriveSessionMaterial({
    pairingSecret,
    shareId: 'share_private_preview',
    sessionId: 'session_private_preview',
    hostNonce: generateHandshakeNonce(),
    guestNonce: generateHandshakeNonce(),
  });
  return {
    host: new SecureCollaborationChannel({
      role: 'host', shareId: 'share_private_preview', localDeviceId: 'host_device_01', remoteDeviceId: 'guest_device_01', material,
    }),
    guest: new SecureCollaborationChannel({
      role: 'guest', shareId: 'share_private_preview', localDeviceId: 'guest_device_01', remoteDeviceId: 'host_device_01', material,
    }),
  };
}

describe('collaboration protocol', () => {
  it('keeps the pairing secret in the URI fragment', () => {
    const secret = generatePairingSecret();
    const uri = createInviteUri('share_private_preview', secret);
    expect(uri).toBe(`orkestrai://join/share_private_preview#${secret}`);
    expect(new URL(uri).search).toBe('');
    expect(parseInviteUri(uri)).toEqual({ shareId: 'share_private_preview', pairingSecret: secret });
  });

  it('derives independent directional keys and exchanges authenticated messages', () => {
    const { host, guest } = channelPair();
    const outbound = host.encrypt({ type: 'ping', sentAt: 42 }, 'guest_device_01');
    expect(outbound.ciphertext).not.toContain('ping');
    expect(guest.decrypt(outbound)).toEqual({ type: 'ping', sentAt: 42 });
    expect(host.decrypt(guest.encrypt({ type: 'pong', sentAt: 42 }, 'host_device_01'))).toEqual({ type: 'pong', sentAt: 42 });
  });

  it('rejects replayed and out-of-order envelopes', () => {
    const { host, guest } = channelPair();
    const first = host.encrypt({ type: 'ping', sentAt: 1 }, 'guest_device_01');
    expect(guest.decrypt(first)).toEqual({ type: 'ping', sentAt: 1 });
    expect(() => guest.decrypt(first)).toThrow(/replayed or out of order/);
    const second = host.encrypt({ type: 'ping', sentAt: 2 }, 'guest_device_01');
    const third = host.encrypt({ type: 'ping', sentAt: 3 }, 'guest_device_01');
    expect(() => guest.decrypt(third)).toThrow(/replayed or out of order/);
    expect(guest.decrypt(second)).toEqual({ type: 'ping', sentAt: 2 });
  });

  it('rejects ciphertext and authenticated routing-field tampering', () => {
    const { host, guest } = channelPair();
    const envelope = host.encrypt({ type: 'ping', sentAt: 9 }, 'guest_device_01');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64url');
    ciphertext[0] ^= 1;
    expect(() => guest.decrypt({ ...envelope, ciphertext: ciphertext.toString('base64url') })).toThrow(/authentication failed/);

    const fresh = channelPair();
    const routed = fresh.host.encrypt({ type: 'ping', sentAt: 9 }, 'guest_device_01');
    expect(() => fresh.guest.decrypt({ ...routed, recipientPeerId: 'different_peer' })).toThrow(/authentication failed/);
  });
});
