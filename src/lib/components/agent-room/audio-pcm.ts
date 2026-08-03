/**
 * Converte um blob de audio (webm/opus do MediaRecorder) para WAV PCM16 mono
 * 16 kHz — o formato que o STT embarcado (sherpa-onnx) espera. A decodificacao
 * acontece no renderer (AudioContext nativo), sem ffmpeg no servidor.
 */

const TARGET_RATE = 16_000;

export async function blobToWav16k(blob: Blob): Promise<Blob> {
  if (blob.size === 0) throw new Error('Nenhum audio foi gravado.');
  const audioContext = new AudioContext({ sampleRate: TARGET_RATE });
  try {
    const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
    const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
    const offline = new OfflineAudioContext(1, frameCount, TARGET_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    return pcmToWavBlob(rendered.getChannelData(0), TARGET_RATE);
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

function pcmToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}
