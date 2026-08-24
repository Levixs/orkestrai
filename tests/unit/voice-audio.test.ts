import { describe, expect, it } from 'vitest';
import {
  analyzeAudioSignal,
  audioSignalIsEmpty,
  normalizeSpeechAudio,
  resampleAudio,
} from '$lib/modules/agent-room/domain/voice-audio.js';

describe('dictation PCM processing', () => {
  it('detects a device that opened without producing samples', () => {
    expect(audioSignalIsEmpty(analyzeAudioSignal(new Float32Array()))).toBe(true);
    expect(audioSignalIsEmpty(analyzeAudioSignal(new Float32Array(1_600)))).toBe(true);
    expect(audioSignalIsEmpty(analyzeAudioSignal(new Float32Array([0, 0.01, -0.01])))).toBe(false);
  });

  it('resamples with interpolation and preserves duration', () => {
    const source = Float32Array.from({ length: 48_000 }, (_, index) => Math.sin(index / 20));
    const output = resampleAudio(source, 48_000, 16_000);
    expect(output).toHaveLength(16_000);
    expect(analyzeAudioSignal(output).durationSeconds).toBeCloseTo(1, 5);
  });

  it('removes DC offset and raises quiet speech without clipping', () => {
    const source = Float32Array.from({ length: 1_000 }, (_, index) => 0.2 + Math.sin(index / 10) * 0.02);
    const output = normalizeSpeechAudio(source);
    const stats = analyzeAudioSignal(output);
    const mean = output.reduce((total, sample) => total + sample, 0) / output.length;
    expect(Math.abs(mean)).toBeLessThan(0.001);
    expect(stats.peak).toBeGreaterThan(0.1);
    expect(stats.peak).toBeLessThanOrEqual(1);
  });
});
