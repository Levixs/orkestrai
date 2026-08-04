/**
 * Worker de inferencia de voz (STT Parakeet + TTS Kokoro via sherpa-onnx).
 * Roda como SUBPROCESSO (fork) sob um Node.js real: a inferencia nao congela o
 * servidor/UI, e o V8 sandbox do Electron proibe os buffers externos que a lib
 * nativa usa no TTS ("External buffers are not allowed") — por isso o pai
 * resolve um Node do sistema (PATH, homebrew, nvm) para executar este arquivo.
 * Autocontido (sem imports do app) — recebe paths de modelos via env (VOICE_*).
 */
const { VOICE_PARAKEET_DIR: parakeetDir, VOICE_KOKORO_DIR: kokoroDir } = process.env;
const ptVoices = JSON.parse(process.env.VOICE_PT_VOICES ?? '{}');

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

process.on('message', async (job) => {
  const { id, kind, payload } = job;
  try {
    if (kind === 'transcribe') {
      const rec = await getRecognizer();
      const stream = rec.createStream();
      stream.acceptWaveform({ samples: new Float32Array(payload.samples), sampleRate: 16_000 });
      rec.decode(stream);
      process.send({ id, ok: true, text: rec.getResult(stream).text.trim() });
      return;
    }
    if (kind === 'speak') {
      const synth = await getTts();
      const sid = ptVoices[payload.voice] ?? ptVoices.pf_dora;
      const audio = synth.generate({ text: String(payload.text).slice(0, 2_000), sid, speed: 1.0 });
      process.send({ id, ok: true, samples: Array.from(audio.samples), sampleRate: synth.sampleRate });
      return;
    }
    process.send({ id, ok: false, error: `tipo desconhecido: ${kind}` });
  } catch (error) {
    process.send({ id, ok: false, error: error instanceof Error ? error.message.split('\n')[0] : String(error) });
  }
});
