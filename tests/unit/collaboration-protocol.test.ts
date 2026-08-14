import { describe, expect, it } from 'vitest';
import {
  SecureCollaborationChannel,
  createInviteUri,
  createWebInviteUri,
  deriveSessionMaterial,
  generateHandshakeNonce,
  generatePairingSecret,
  parseInviteUri,
} from '@orkestrai/collaboration-protocol';
import {
  SecureCollaborationChannel as SecureBrowserCollaborationChannel,
  deriveSessionMaterial as deriveBrowserSessionMaterial,
  importPairingSecret,
} from '@orkestrai/collaboration-protocol/browser';

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
    const webUri = createWebInviteUri('https://remote.orkestrai.app', 'share_private_preview', secret);
    expect(webUri).toBe(`https://remote.orkestrai.app/join/share_private_preview#${secret}`);
    expect(new URL(webUri).search).toBe('');
    expect(parseInviteUri(webUri)).toEqual({ shareId: 'share_private_preview', pairingSecret: secret });
  });

  it('exchanges encrypted frames between Node and Web Crypto clients', async () => {
    const pairingSecret = generatePairingSecret();
    const hostNonce = generateHandshakeNonce();
    const guestNonce = generateHandshakeNonce();
    const input = {
      pairingSecret,
      shareId: 'share_browser_compatibility',
      sessionId: 'session_browser_compatibility',
      hostNonce,
      guestNonce,
    };
    const nodeMaterial = deriveSessionMaterial(input);
    const browserMaterial = await deriveBrowserSessionMaterial({
      pairingKey: await importPairingSecret(pairingSecret),
      shareId: input.shareId,
      sessionId: input.sessionId,
      hostNonce,
      guestNonce,
    });
    expect(browserMaterial.keyId).toBe(nodeMaterial.keyId);

    const host = new SecureCollaborationChannel({
      role: 'host', shareId: input.shareId, localDeviceId: 'host_browser_compat',
      remoteDeviceId: 'guest_browser_compat', material: nodeMaterial,
    });
    const guest = new SecureBrowserCollaborationChannel({
      role: 'guest', shareId: input.shareId, localDeviceId: 'guest_browser_compat',
      remoteDeviceId: 'host_browser_compat', material: browserMaterial,
    });

    expect(await guest.decrypt(host.encrypt({ type: 'ping', sentAt: 84 }, 'guest_browser_compat')))
      .toEqual({ type: 'ping', sentAt: 84 });
    expect(host.decrypt(await guest.encrypt({ type: 'pong', sentAt: 84 }, 'host_browser_compat')))
      .toEqual({ type: 'pong', sentAt: 84 });
  });

  it('derives independent directional keys and exchanges authenticated messages', () => {
    const { host, guest } = channelPair();
    const outbound = host.encrypt({ type: 'ping', sentAt: 42 }, 'guest_device_01');
    expect(outbound.ciphertext).not.toContain('ping');
    expect(guest.decrypt(outbound)).toEqual({ type: 'ping', sentAt: 42 });
    expect(host.decrypt(guest.encrypt({ type: 'pong', sentAt: 42 }, 'host_device_01'))).toEqual({ type: 'pong', sentAt: 42 });
  });

  it('encrypts remote terminal control and output frames', () => {
    const { host, guest } = channelPair();
    const open = guest.encrypt({
      type: 'terminal.open', nodeId: 'agent_node_01', cols: 120, rows: 36,
    }, 'host_device_01');
    expect(host.decrypt(open)).toEqual({
      type: 'terminal.open', nodeId: 'agent_node_01', cols: 120, rows: 36,
    });
    const output = host.encrypt({
      type: 'terminal.output', nodeId: 'agent_node_01', data: '\u001b[32mready\u001b[0m',
    }, 'guest_device_01');
    expect(guest.decrypt(output)).toMatchObject({ type: 'terminal.output', data: '\u001b[32mready\u001b[0m' });
  });

  it('encrypts bounded remote voice transcription frames', () => {
    const { host, guest } = channelPair();
    const requestId = 'voice_request_01';
    const audioBytes = Buffer.alloc(48, 1);
    const audio = audioBytes.toString('base64url');
    expect(host.decrypt(guest.encrypt({
      type: 'voice.transcription.start', requestId, language: 'pt', byteLength: audioBytes.byteLength, chunks: 1,
    }, 'host_device_01'))).toMatchObject({ type: 'voice.transcription.start', requestId, language: 'pt' });
    expect(host.decrypt(guest.encrypt({
      type: 'voice.transcription.chunk', requestId, index: 0, data: audio,
    }, 'host_device_01'))).toMatchObject({ type: 'voice.transcription.chunk', requestId, data: audio });
    expect(guest.decrypt(host.encrypt({
      type: 'voice.transcription.result', requestId, text: 'Mensagem ditada.',
    }, 'guest_device_01'))).toMatchObject({ type: 'voice.transcription.result', text: 'Mensagem ditada.' });
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
