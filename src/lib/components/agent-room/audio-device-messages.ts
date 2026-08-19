import type { AudioCaptureFailure } from './audio-devices.js';
import * as m from '$lib/paraglide/messages.js';

export function audioCaptureFailureMessage(failure: AudioCaptureFailure): string {
  if (failure === 'permission-denied') return m['voice.mic_denied']();
  if (failure === 'device-missing') return m['voice.mic_missing']();
  if (failure === 'device-busy') return m['voice.mic_busy']();
  if (failure === 'capture-interrupted') return m['voice.mic_interrupted']();
  return m['voice.mic_unavailable']();
}
