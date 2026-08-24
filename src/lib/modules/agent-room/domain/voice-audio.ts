export const DICTATION_SAMPLE_RATE = 16_000;

export type AudioSignalStats = {
  durationSeconds: number;
  peak: number;
  rms: number;
};

export function analyzeAudioSignal(samples: Float32Array, sampleRate = DICTATION_SAMPLE_RATE): AudioSignalStats {
  let peak = 0;
  let sumSquares = 0;
  for (const sample of samples) {
    const absolute = Math.abs(sample);
    if (absolute > peak) peak = absolute;
    sumSquares += sample * sample;
  }
  return {
    durationSeconds: sampleRate > 0 ? samples.length / sampleRate : 0,
    peak,
    rms: samples.length ? Math.sqrt(sumSquares / samples.length) : 0,
  };
}

export function audioSignalIsEmpty(stats: AudioSignalStats): boolean {
  return stats.durationSeconds <= 0 || (stats.peak < 0.0001 && stats.rms < 0.00001);
}

export function resampleAudio(
  samples: Float32Array,
  sourceRate: number,
  targetRate = DICTATION_SAMPLE_RATE
): Float32Array {
  if (!samples.length || sourceRate <= 0 || targetRate <= 0) return new Float32Array();
  if (sourceRate === targetRate) return samples.slice();
  const outputLength = Math.max(1, Math.round(samples.length * targetRate / sourceRate));
  const output = new Float32Array(outputLength);
  const scale = sourceRate / targetRate;
  for (let index = 0; index < outputLength; index += 1) {
    const position = Math.min(samples.length - 1, index * scale);
    const left = Math.floor(position);
    const right = Math.min(samples.length - 1, left + 1);
    const fraction = position - left;
    output[index] = samples[left] + (samples[right] - samples[left]) * fraction;
  }
  return output;
}

/** Removes DC offset and raises genuinely quiet speech without clipping it. */
export function normalizeSpeechAudio(samples: Float32Array): Float32Array {
  if (!samples.length) return new Float32Array();
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;

  let centeredPeak = 0;
  for (const sample of samples) centeredPeak = Math.max(centeredPeak, Math.abs(sample - mean));
  if (centeredPeak < 0.0001) return samples.slice();

  const gain = centeredPeak < 0.7 ? Math.min(8, 0.7 / centeredPeak) : 1;
  const output = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    output[index] = Math.max(-1, Math.min(1, (samples[index] - mean) * gain));
  }
  return output;
}
