/**
 * Worker de inferencia de voz (STT Parakeet + TTS Kokoro via sherpa-onnx).
 * Roda FORA da thread principal: transcricao/sintese nao congelam o servidor
 * nem a UI. Autocontido (sem imports do app) — recebe paths via mensagem.
 */
import { parentPort, workerData } from 'node:worker_threads';

const { parakeetDir, kokoroDir, ptVoices } = workerData;

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
      kokoro: {
        model: `${kokoroDir}/model.onnx`,
        voices: `${kokoroDir}/voices.bin`,
        tokens: `${kokoroDir}/tokens.txt`,
        dataDir: `${kokoroDir}/espeak-ng-data`,
        lang: 'pt',
      },
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
  });
  return tts;
}

parentPort.on('message', async (job) => {
  const { id, kind, payload } = job;
  try {
    if (kind === 'transcribe') {
      const rec = await getRecognizer();
      const stream = rec.createStream();
      stream.acceptWaveform({ samples: new Float32Array(payload.samples), sampleRate: 16_000 });
      rec.decode(stream);
      parentPort.postMessage({ id, ok: true, text: rec.getResult(stream).text.trim() });
      return;
    }
    if (kind === 'speak') {
      const synth = await getTts();
      const sid = ptVoices[payload.voice] ?? ptVoices.pf_dora;
      const audio = synth.generate({ text: String(payload.text).slice(0, 2_000), sid, speed: 1.0 });
      parentPort.postMessage(
        { id, ok: true, samples: Array.from(audio.samples), sampleRate: synth.sampleRate },
        []
      );
      return;
    }
    parentPort.postMessage({ id, ok: false, error: `tipo desconhecido: ${kind}` });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: error instanceof Error ? error.message.split('\n')[0] : String(error) });
  }
});
