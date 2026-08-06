/**
 * Worker de inferencia de voz (STT Parakeet + TTS Supertonic 3 via sherpa-onnx).
 * Roda como SUBPROCESSO (fork) sob um Node.js real: a inferencia nao congela o
 * servidor/UI, e o V8 sandbox do Electron proibe os buffers externos que a lib
 * nativa usa no TTS ("External buffers are not allowed") — por isso o pai
 * resolve um Node do sistema (PATH, homebrew, nvm) para executar este arquivo.
 * Autocontido (sem imports do app) — recebe paths de modelos via env (VOICE_*).
 */
import { availableParallelism } from 'node:os';

const { VOICE_PARAKEET_DIR: parakeetDir, VOICE_SUPERTONIC_DIR: supertonicDir } = process.env;
const ttsThreads = Math.max(2, Math.min(4, availableParallelism()));

// Se o pai morrer (crash/kill -9), o canal IPC fecha — sai para nao virar orfao.
process.on('disconnect', () => process.exit(0));

let recognizer = null;
let tts = null;

async function loadSherpa() {
  const mod = await import('sherpa-onnx-node');
  return mod.default ?? mod;
}

async function getRecognizer() {
  if (recognizer) return recognizer;
  const sherpa = await loadSherpa();
  recognizer = new sherpa.OfflineRecognizer({
    modelConfig: {
      transducer: {
        encoder: `${parakeetDir}/encoder.int8.onnx`,
        decoder: `${parakeetDir}/decoder.int8.onnx`,
        joiner: `${parakeetDir}/joiner.int8.onnx`,
      },
      tokens: `${parakeetDir}/tokens.txt`,
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
  });
  return recognizer;
}

async function getTts() {
  if (tts) return tts;
  const sherpa = await loadSherpa();
  tts = new sherpa.OfflineTts({
    model: {
      supertonic: {
        durationPredictor: `${supertonicDir}/duration_predictor.int8.onnx`,
        textEncoder: `${supertonicDir}/text_encoder.int8.onnx`,
        vectorEstimator: `${supertonicDir}/vector_estimator.int8.onnx`,
        vocoder: `${supertonicDir}/vocoder.int8.onnx`,
        ttsJson: `${supertonicDir}/tts.json`,
        unicodeIndexer: `${supertonicDir}/unicode_indexer.bin`,
        voiceStyle: `${supertonicDir}/voice.bin`,
      },
      numThreads: ttsThreads,
      provider: 'cpu',
      debug: 0,
    },
    maxNumSentences: 1,
  });
  return tts;
}

function float32Bytes(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const samples = new Float32Array(bytes.byteLength / Float32Array.BYTES_PER_ELEMENT);
  new Uint8Array(samples.buffer).set(bytes);
  return samples;
}

function pcm16Bytes(samples) {
  const pcm = Buffer.allocUnsafe(samples.length * Int16Array.BYTES_PER_ELEMENT);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    pcm.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  return pcm;
}

process.on('message', async (job) => {
  const { id, kind, payload } = job;
  try {
    if (kind === 'transcribe') {
      const rec = await getRecognizer();
      const stream = rec.createStream();
      stream.acceptWaveform({ samples: float32Bytes(payload.samples), sampleRate: 16_000 });
      rec.decode(stream);
      process.send({ id, ok: true, text: rec.getResult(stream).text.trim() });
      return;
    }
    if (kind === 'speak') {
      const sherpa = await loadSherpa();
      const synth = await getTts();
      const generationConfig = new sherpa.GenerationConfig({
        sid: Number(payload.sid) || 0,
        speed: Math.min(1.5, Math.max(0.75, Number(payload.speed) || 1)),
        numSteps: 8,
        extra: { lang: ['pt', 'en', 'es'].includes(payload.language) ? payload.language : 'pt' },
      });
      const audio = synth.generate({
        text: String(payload.text).slice(0, 2_000),
        generationConfig,
      });
      process.send({ id, ok: true, pcm16: pcm16Bytes(audio.samples), sampleRate: audio.sampleRate });
      return;
    }
    process.send({ id, ok: false, error: `tipo desconhecido: ${kind}` });
  } catch (error) {
    process.send({ id, ok: false, error: error instanceof Error ? error.message.split('\n')[0] : String(error) });
  }
});
