export const DEFAULT_AUDIO_DEVICE_ID = 'default';

export type AudioDeviceInventory = {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
};

export type AudioCaptureFailure =
  | 'permission-denied'
  | 'device-missing'
  | 'device-busy'
  | 'capture-interrupted'
  | 'capture-failed';

export function audioInputConstraint(deviceId: string | null | undefined): boolean | MediaTrackConstraints {
  const selected = deviceId?.trim();
  return !selected || selected === DEFAULT_AUDIO_DEVICE_ID
    ? true
    : { deviceId: { exact: selected } };
}

function errorName(error: unknown): string {
  return error instanceof DOMException ? error.name : error instanceof Error ? error.name : '';
}

export function classifyAudioCaptureFailure(error: unknown, inputCount: number): AudioCaptureFailure {
  const name = errorName(error);
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission-denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'device-missing';
  if (name === 'AbortError') return 'capture-interrupted';
  if (name === 'NotReadableError' && inputCount <= 1) return 'device-busy';
  return 'capture-failed';
}

export async function audioDeviceInventory(): Promise<AudioDeviceInventory> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    inputs: devices.filter((device) => device.kind === 'audioinput'),
    outputs: devices.filter((device) => device.kind === 'audiooutput'),
  };
}

export async function openPreferredAudioInput(deviceId: string | null | undefined): Promise<{ stream: MediaStream; fallback: boolean }> {
  const selected = deviceId?.trim();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioInputConstraint(selected) });
    return { stream, fallback: false };
  } catch (error) {
    const name = errorName(error);
    if (selected && selected !== DEFAULT_AUDIO_DEVICE_ID && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return { stream, fallback: true };
    }
    throw error;
  }
}

export function missingPreferredAudioDevices(
  inventory: AudioDeviceInventory,
  inputDeviceId: string | null | undefined,
  outputDeviceId: string | null | undefined,
): { input: boolean; output: boolean } {
  const input = Boolean(inputDeviceId && inputDeviceId !== DEFAULT_AUDIO_DEVICE_ID && !inventory.inputs.some((device) => device.deviceId === inputDeviceId));
  const output = Boolean(outputDeviceId && outputDeviceId !== DEFAULT_AUDIO_DEVICE_ID && !inventory.outputs.some((device) => device.deviceId === outputDeviceId));
  return { input, output };
}

type SinkAudio = HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> };

export function supportsAudioOutputSelection(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

export async function playAudioBlob(blob: Blob, outputDeviceId?: string | null): Promise<{ fallback: boolean; unsupported: boolean }> {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url) as SinkAudio;
  let fallback = false;
  const selected = outputDeviceId?.trim();
  const unsupported = Boolean(selected && selected !== DEFAULT_AUDIO_DEVICE_ID && !audio.setSinkId);
  try {
    if (selected && selected !== DEFAULT_AUDIO_DEVICE_ID && audio.setSinkId) {
      try {
        await audio.setSinkId(selected);
      } catch {
        fallback = true;
      }
    }
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('audio_playback_failed'));
      audio.play().catch(reject);
    });
    return { fallback, unsupported };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function audioTestTone(durationSeconds = 0.65, sampleRate = 22_050): Blob {
  const frames = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const bytes = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(bytes);
  const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + frames * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, frames * 2, true);
  for (let index = 0; index < frames; index += 1) {
    const envelope = Math.min(1, index / (sampleRate * 0.03), (frames - index) / (sampleRate * 0.08));
    view.setInt16(44 + index * 2, Math.round(Math.sin(index / sampleRate * Math.PI * 2 * 523.25) * envelope * 8_000), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
