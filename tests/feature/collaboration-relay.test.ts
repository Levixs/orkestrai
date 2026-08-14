import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { COLLABORATION_PROTOCOL } from '@orkestrai/collaboration-protocol';
import { createRelayServer } from '../../packages/orkestrai-relay/src/server.mjs';

let relay: ReturnType<typeof createRelayServer> | null = null;

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, COLLABORATION_PROTOCOL, { perMessageDeflate: false });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => resolve(Buffer.from(data).toString('utf8')));
    socket.once('error', reject);
  });
}

afterEach(async () => {
  await relay?.close();
  relay = null;
});

describe('opaque collaboration relay', () => {
  it('forwards a valid opaque envelope without plaintext inspection', async () => {
    relay = createRelayServer();
    const address = await relay.listen(0, '127.0.0.1');
    if (!address || typeof address === 'string') throw new Error('Relay address was not assigned.');
    const base = `ws://127.0.0.1:${address.port}/v1/connect?share=share_relay_test&peer=`;
    const host = await connect(`${base}host_device_01&role=host`);
    const guest = await connect(`${base}guest_device_01&role=guest`);
    const frame = JSON.stringify({
      protocol: COLLABORATION_PROTOCOL,
      shareId: 'share_relay_test',
      senderDeviceId: 'guest_device_01',
      recipientPeerId: 'host_device_01',
      keyId: 'opaque_key_identifier_01',
      sequence: 1,
      nonce: 'AAAAAAAAAAAAAAAA',
      ciphertext: 'opaqueEncryptedPayloadValue',
    });
    const received = nextMessage(host);
    guest.send(frame);
    expect(await received).toBe(frame);
    expect(relay.metrics.framesForwarded).toBe(1);
    host.close();
    guest.close();
  });

  it('rejects browser origins unless explicitly allowlisted', async () => {
    relay = createRelayServer();
    const address = await relay.listen(0, '127.0.0.1');
    if (!address || typeof address === 'string') throw new Error('Relay address was not assigned.');
    const url = `ws://127.0.0.1:${address.port}/v1/connect?share=share_relay_test&peer=host_device_01&role=host`;
    await expect(new Promise((resolve, reject) => {
      const socket = new WebSocket(url, COLLABORATION_PROTOCOL, { origin: 'https://attacker.example' });
      socket.once('open', resolve);
      socket.once('error', reject);
    })).rejects.toThrow(/403/);
  });
});
