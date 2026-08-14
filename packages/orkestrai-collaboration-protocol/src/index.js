import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import {
  COLLABORATION_PROTOCOL,
  MAX_ENCRYPTED_FRAME_BYTES,
  MAX_PLAINTEXT_BYTES,
  assertOpaqueId,
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

function decodeFixed(value, bytes, label) {
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== bytes) throw new Error(`${label} must contain ${bytes} random bytes.`);
  return decoded;
}

export function generatePairingSecret() {
  return randomBytes(32).toString('base64url');
}

export function generateHandshakeNonce() {
  return randomBytes(32).toString('base64url');
}

export function deriveSessionMaterial({ pairingSecret, shareId, sessionId, hostNonce, guestNonce }) {
  const secret = decodeFixed(pairingSecret, 32, 'Pairing secret');
  const hostRandom = decodeFixed(hostNonce, 32, 'Host nonce');
  const guestRandom = decodeFixed(guestNonce, 32, 'Guest nonce');
  assertOpaqueId(shareId, 'Share id');
  assertOpaqueId(sessionId, 'Session id');
  const transcript = Buffer.from(JSON.stringify([
    COLLABORATION_PROTOCOL,
    shareId,
    sessionId,
    hostRandom.toString('base64url'),
    guestRandom.toString('base64url'),
  ]));
  const salt = createHash('sha256').update(transcript).digest();
  const hostToGuestKey = Buffer.from(hkdfSync('sha256', secret, salt, `${COLLABORATION_PROTOCOL}:host-to-guest`, 32));
  const guestToHostKey = Buffer.from(hkdfSync('sha256', secret, salt, `${COLLABORATION_PROTOCOL}:guest-to-host`, 32));
  const keyId = createHash('sha256').update(hostToGuestKey).update(guestToHostKey).digest('base64url').slice(0, 24);
  return { hostToGuestKey, guestToHostKey, keyId };
}

export function derivePairingMaterial({ pairingSecret, shareId }) {
  const secret = decodeFixed(pairingSecret, 32, 'Pairing secret');
  assertOpaqueId(shareId, 'Share id');
  const salt = createHash('sha256').update(`${COLLABORATION_PROTOCOL}:${shareId}:pairing`).digest();
  const hostToGuestKey = Buffer.from(hkdfSync('sha256', secret, salt, `${COLLABORATION_PROTOCOL}:pairing:host-to-guest`, 32));
  const guestToHostKey = Buffer.from(hkdfSync('sha256', secret, salt, `${COLLABORATION_PROTOCOL}:pairing:guest-to-host`, 32));
  const keyId = createHash('sha256').update(hostToGuestKey).update(guestToHostKey).digest('base64url').slice(0, 24);
  return { hostToGuestKey, guestToHostKey, keyId };
}

function authenticatedData(envelope) {
  return Buffer.from(JSON.stringify([
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

  constructor({ role, shareId, localDeviceId, remoteDeviceId, material }) {
    if (role !== 'host' && role !== 'guest') throw new Error('Channel role is invalid.');
    this.role = role;
    this.shareId = assertOpaqueId(shareId, 'Share id');
    this.localDeviceId = assertOpaqueId(localDeviceId, 'Local device id');
    this.remoteDeviceId = assertOpaqueId(remoteDeviceId, 'Remote device id');
    this.keyId = material.keyId;
    this.#sendKey = role === 'host' ? material.hostToGuestKey : material.guestToHostKey;
    this.#receiveKey = role === 'host' ? material.guestToHostKey : material.hostToGuestKey;
  }

  get sentSequence() { return this.#sendSequence; }
  get receivedSequence() { return this.#receiveSequence; }

  encrypt(message, recipientPeerId = null) {
    const parsed = collaborationMessageSchema.parse(message);
    const plaintext = Buffer.from(JSON.stringify(parsed));
    if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new Error('Collaboration plaintext exceeds the protocol limit.');
    const nonce = randomBytes(12);
    const envelope = {
      protocol: COLLABORATION_PROTOCOL,
      shareId: this.shareId,
      senderDeviceId: this.localDeviceId,
      recipientPeerId,
      keyId: this.keyId,
      sequence: this.#sendSequence + 1,
      nonce: nonce.toString('base64url'),
      ciphertext: '',
    };
    const cipher = createCipheriv('aes-256-gcm', this.#sendKey, nonce, { authTagLength: 16 });
    cipher.setAAD(authenticatedData(envelope));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    envelope.ciphertext = ciphertext.toString('base64url');
    collaborationEnvelopeSchema.parse(envelope);
    this.#sendSequence = envelope.sequence;
    return envelope;
  }

  decrypt(candidate) {
    const envelope = collaborationEnvelopeSchema.parse(candidate);
    if (envelope.shareId !== this.shareId || envelope.senderDeviceId !== this.remoteDeviceId || envelope.keyId !== this.keyId) {
      throw new Error('Collaboration envelope identity mismatch.');
    }
    if (envelope.sequence !== this.#receiveSequence + 1) throw new Error('Collaboration envelope replayed or out of order.');
    const nonce = decodeFixed(envelope.nonce, 12, 'Envelope nonce');
    const encrypted = Buffer.from(envelope.ciphertext, 'base64url');
    if (encrypted.length < 17 || encrypted.length > MAX_ENCRYPTED_FRAME_BYTES) throw new Error('Collaboration ciphertext size is invalid.');
    const decipher = createDecipheriv('aes-256-gcm', this.#receiveKey, nonce, { authTagLength: 16 });
    decipher.setAAD(authenticatedData(envelope));
    decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
    let plaintext;
    try {
      plaintext = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
    } catch {
      throw new Error('Collaboration envelope authentication failed.');
    }
    if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new Error('Collaboration plaintext exceeds the protocol limit.');
    let message;
    try {
      message = JSON.parse(plaintext.toString('utf8'));
    } catch {
      throw new Error('Collaboration plaintext is not valid JSON.');
    }
    const parsed = collaborationMessageSchema.parse(message);
    this.#receiveSequence = envelope.sequence;
    return parsed;
  }
}
