import { describe, expect, it } from 'vitest';
import {
  audioInputConstraint,
  audioTestTone,
  classifyAudioCaptureFailure,
  missingPreferredAudioDevices,
} from '$lib/components/agent-room/audio-devices.js';

describe('audio device preferences', () => {
  it('uses an exact constraint only for a selected microphone', () => {
    expect(audioInputConstraint('default')).toBe(true);
    expect(audioInputConstraint('mic-2')).toEqual({ deviceId: { exact: 'mic-2' } });
  });

  it('distinguishes permission, missing, busy, interrupted, and generic failures', () => {
    expect(classifyAudioCaptureFailure(new DOMException('', 'NotAllowedError'), 1)).toBe('permission-denied');
    expect(classifyAudioCaptureFailure(new DOMException('', 'NotFoundError'), 0)).toBe('device-missing');
    expect(classifyAudioCaptureFailure(new DOMException('', 'NotReadableError'), 1)).toBe('device-busy');
    expect(classifyAudioCaptureFailure(new DOMException('', 'NotReadableError'), 2)).toBe('capture-failed');
    expect(classifyAudioCaptureFailure(new DOMException('', 'AbortError'), 1)).toBe('capture-interrupted');
  });

  it('detects removed preferred devices without treating default as missing', () => {
    const microphone = { kind: 'audioinput', deviceId: 'mic-1' } as MediaDeviceInfo;
    const speaker = { kind: 'audiooutput', deviceId: 'speaker-1' } as MediaDeviceInfo;
    expect(missingPreferredAudioDevices({ inputs: [microphone], outputs: [speaker] }, 'mic-1', 'speaker-1')).toEqual({ input: false, output: false });
    expect(missingPreferredAudioDevices({ inputs: [microphone], outputs: [speaker] }, 'mic-2', 'speaker-2')).toEqual({ input: true, output: true });
    expect(missingPreferredAudioDevices({ inputs: [], outputs: [] }, 'default', 'default')).toEqual({ input: false, output: false });
  });

  it('creates a playable PCM test tone', async () => {
    const tone = audioTestTone(0.1, 8_000);
    expect(tone.type).toBe('audio/wav');
    expect(tone.size).toBe(44 + 800 * 2);
    expect(await tone.slice(0, 4).text()).toBe('RIFF');
  });
});
