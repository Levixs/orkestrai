import { describe, expect, it } from 'vitest';
import { pcmToWav, wavToPcm16, KOKORO_PT_VOICES } from '$lib/modules/agent-room/infrastructure/voice/EmbeddedVoice.js';

function makeWav(samples: number[], rate = 16_000, channels = 1): Buffer {
  const buffer = Buffer.alloc(44 + samples.length * 2 * channels);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + samples.length * 2 * channels, 4);
  buffer.write('WAVEfmt ', 8, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2 * channels, 28);
  buffer.writeUInt16LE(2 * channels, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(samples.length * 2 * channels, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2 * channels));
  return buffer;
}

describe('wavToPcm16 / pcmToWav', () => {
  it('parse WAV PCM16 16kHz mono', () => {
    const { samples, sampleRate } = wavToPcm16(makeWav([0, 1000, -1000, 32767]));
    expect(sampleRate).toBe(16_000);
    expect(samples.length).toBe(4);
    expect(samples[1]).toBeCloseTo(1000 / 32768, 4);
    expect(samples[2]).toBeCloseTo(-1000 / 32768, 4);
  });

  it('resample 24kHz -> 16kHz (2/3 das amostras)', () => {
    const { samples } = wavToPcm16(makeWav(new Array(300).fill(500), 24_000));
    expect(samples.length).toBe(200);
  });

  it('rejeita nao-WAV', () => {
    expect(() => wavToPcm16(Buffer.from('not a wav file at all........'))).toThrow('WAV');
  });

  it('roundtrip pcm -> wav -> pcm', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const wav = pcmToWav(input, 16_000);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(16_000);
    const { samples } = wavToPcm16(wav);
    expect(samples.length).toBe(input.length);
    expect(samples[1]).toBeCloseTo(0.5, 2);
    expect(samples[3]).toBeCloseTo(1, 2);
  });

  it('vozes pt-BR mapeadas para sids validos (0-52)', () => {
    for (const [voice, sid] of Object.entries(KOKORO_PT_VOICES)) {
      expect(voice).toMatch(/^p[fm]_/);
      expect(sid).toBeGreaterThanOrEqual(0);
      expect(sid).toBeLessThanOrEqual(52);
    }
    expect(KOKORO_PT_VOICES.pf_dora).not.toBe(KOKORO_PT_VOICES.pm_alex);
  });
});
