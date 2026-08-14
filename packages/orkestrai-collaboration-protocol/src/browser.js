import {
  COLLABORATION_PROTOCOL,
  MAX_ENCRYPTED_FRAME_BYTES,
  MAX_PLAINTEXT_BYTES,
  assertOpaqueId,
  assertPairingSecret,
  collaborationEnvelopeSchema,
  collaborationMessageSchema,
} from './common.js';

export {
  COLLABORATION_PROTOCOL,
  MAX_ENCRYPTED_FRAME_BYTES,
  MAX_PLAINTEXT_BYTES,
  collaborationEnvelopeSchema,
  collaborationMessageSchema,
  collaborationRoleSchema,
  createInviteUri,
  createWebInviteUri,
  parseInviteUri,
} from './common.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(value) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(value, expectedBytes, label) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  let decoded;
  try {
    decoded = Uint8Array.from(atob(normalized + padding), (character) => character.charCodeAt(0));
  } catch {
    throw new Error(`${label} is not valid base64url.`);
  }
  if (decoded.byteLength !== expectedBytes) throw new Error(`${label} must contain ${expectedBytes} random bytes.`);
  return decoded;
}

function concatBytes(left, right) {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left, 0);
  combined.set(right, left.byteLength);
  return combined;
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', value));
}

async function deriveDirectionalKey(pairingKey, salt, info) {
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(info) },
    pairingKey,
    256,
  ));
  const key = await crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { bits, key };
}

export function generatePairingSecret() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function generateHandshakeNonce() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function importPairingSecret(pairingSecret) {
  assertPairingSecret(pairingSecret);
  return crypto.subtle.importKey(
    'raw',
    base64UrlToBytes(pairingSecret, 32, 'Pairing secret'),
    'HKDF',
    false,
    ['deriveBits'],
  );
}

async function material(pairingKey, salt, prefix) {
  const host = await deriveDirectionalKey(pairingKey, salt, `${COLLABORATION_PROTOCOL}:${prefix}host-to-guest`);
  const guest = await deriveDirectionalKey(pairingKey, salt, `${COLLABORATION_PROTOCOL}:${prefix}guest-to-host`);
  const keyId = bytesToBase64Url(await sha256(concatBytes(host.bits, guest.bits))).slice(0, 24);
  host.bits.fill(0);
  guest.bits.fill(0);
  return { hostToGuestKey: host.key, guestToHostKey: guest.key, keyId };
}

export async function derivePairingMaterial({ pairingKey, shareId }) {
  assertOpaqueId(shareId, 'Share id');
  const salt = await sha256(encoder.encode(`${COLLABORATION_PROTOCOL}:${shareId}:pairing`));
  return material(pairingKey, salt, 'pairing:');
}

export async function deriveSessionMaterial({ pairingKey, shareId, sessionId, hostNonce, guestNonce }) {
  assertOpaqueId(shareId, 'Share id');
  assertOpaqueId(sessionId, 'Session id');
  const hostRandom = base64UrlToBytes(hostNonce, 32, 'Host nonce');
  const guestRandom = base64UrlToBytes(guestNonce, 32, 'Guest nonce');
  const transcript = encoder.encode(JSON.stringify([
    COLLABORATION_PROTOCOL,
    shareId,
    sessionId,
    bytesToBase64Url(hostRandom),
    bytesToBase64Url(guestRandom),
  ]));
  return material(pairingKey, await sha256(transcript), '');
}

function authenticatedData(envelope) {
  return encoder.encode(JSON.stringify([
    envelope.protocol,
    envelope.shareId,
    envelope.senderDeviceId,
    envelope.recipientPeerId,
    envelope.keyId,
    envelope.sequence,
    envelope.nonce,
  ]));
}

export class SecureCollaborationChannel {
  #sendKey;
  #receiveKey;
  #sendSequence = 0;
  #receiveSequence = 0;

  constructor({ role, shareId, localDeviceId, remoteDeviceId, material: channelMaterial }) {
    if (role !== 'host' && role !== 'guest') throw new Error('Channel role is invalid.');
    this.role = role;
    this.shareId = assertOpaqueId(shareId, 'Share id');
    this.localDeviceId = assertOpaqueId(localDeviceId, 'Local device id');
    this.remoteDeviceId = assertOpaqueId(remoteDeviceId, 'Remote device id');
    this.keyId = channelMaterial.keyId;
    this.#sendKey = role === 'host' ? channelMaterial.hostToGuestKey : channelMaterial.guestToHostKey;
    this.#receiveKey = role === 'host' ? channelMaterial.guestToHostKey : channelMaterial.hostToGuestKey;
  }

  get sentSequence() { return this.#sendSequence; }
  get receivedSequence() { return this.#receiveSequence; }

  async encrypt(message, recipientPeerId = null) {
    const parsed = collaborationMessageSchema.parse(message);
    const plaintext = encoder.encode(JSON.stringify(parsed));
    if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) throw new Error('Collaboration plaintext exceeds the protocol limit.');
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const envelope = {
      protocol: COLLABORATION_PROTOCOL,
      shareId: this.shareId,
      senderDeviceId: this.localDeviceId,
      recipientPeerId,
      keyId: this.keyId,
      sequence: this.#sendSequence + 1,
      nonce: bytesToBase64Url(nonce),
      ciphertext: '',
    };
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: authenticatedData(envelope), tagLength: 128 },
      this.#sendKey,
      plaintext,
    );
    envelope.ciphertext = bytesToBase64Url(new Uint8Array(ciphertext));
    collaborationEnvelopeSchema.parse(envelope);
    this.#sendSequence = envelope.sequence;
    return envelope;
  }

  async decrypt(candidate) {
    const envelope = collaborationEnvelopeSchema.parse(candidate);
    if (envelope.shareId !== this.shareId || envelope.senderDeviceId !== this.remoteDeviceId || envelope.keyId !== this.keyId) {
      throw new Error('Collaboration envelope identity mismatch.');
    }
    if (envelope.sequence !== this.#receiveSequence + 1) throw new Error('Collaboration envelope replayed or out of order.');
    const nonce = base64UrlToBytes(envelope.nonce, 12, 'Envelope nonce');
    const encrypted = base64UrlToBytesLoose(envelope.ciphertext);
    if (encrypted.byteLength < 17 || encrypted.byteLength > MAX_ENCRYPTED_FRAME_BYTES) throw new Error('Collaboration ciphertext size is invalid.');
    let plaintext;
    try {
      plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: authenticatedData(envelope), tagLength: 128 },
        this.#receiveKey,
        encrypted,
      );
    } catch {
      throw new Error('Collaboration envelope authentication failed.');
    }
    if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) throw new Error('Collaboration plaintext exceeds the protocol limit.');
    let message;
    try {
      message = JSON.parse(decoder.decode(plaintext));
    } catch {
      throw new Error('Collaboration plaintext is not valid JSON.');
    }
    const parsed = collaborationMessageSchema.parse(message);
    this.#receiveSequence = envelope.sequence;
    return parsed;
  }
}

function base64UrlToBytesLoose(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(normalized + padding), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Collaboration ciphertext is not valid base64url.');
  }
}
