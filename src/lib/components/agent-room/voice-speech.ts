import { getCsrfToken } from '@beeblock/svelar/http';

/** Voz de volta multilíngue. A fila global impede respostas sobrepostas. */

let queue: Promise<void> = Promise.resolve();
const MAX_SPEECH_CHARS = 1_000;
const CHUNK_CHARS = 180;

export function speakText(text: string): Promise<void> {
  const run = queue.then(() => speakOnce(text));
  queue = run.catch(() => {});
  return run;
}

async function speakOnce(text: string): Promise<void> {
  const chunks = speechChunks(text);
  if (chunks.length === 0) return;
  let next = fetchSpeech(chunks[0]);
  for (let index = 0; index < chunks.length; index += 1) {
    const blob = await next;
    if (index + 1 < chunks.length) next = fetchSpeech(chunks[index + 1]);
    await playSpeech(blob);
  }
}

async function fetchSpeech(text: string): Promise<Blob> {
  const token = getCsrfToken();
  const response = await fetch('/api/agent-room/voice/speak', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `TTS falhou (HTTP ${response.status}).`);
  }
  return response.blob();
}

async function playSpeech(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Falha ao tocar o audio.'));
      audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Divide por sentencas e limita cada requisicao para iniciar a fala cedo. */
export function speechChunks(text: string, maxChars = CHUNK_CHARS): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim().slice(0, MAX_SPEECH_CHARS);
  if (!normalized) return [];
  const sentences = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(normalized), (part) => part.segment.trim())
    : normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()) ?? [normalized];
  const chunks: string[] = [];
  let current = '';

  const push = () => {
    if (current) chunks.push(current);
    current = '';
  };
  for (const sentence of sentences) {
    if (!sentence) continue;
    if (sentence.length <= maxChars) {
      const combined = current ? `${current} ${sentence}` : sentence;
      if (combined.length <= maxChars) current = combined;
      else {
        push();
        current = sentence;
      }
      continue;
    }
    push();
    for (const word of sentence.split(' ')) {
      const combined = current ? `${current} ${word}` : word;
      if (combined.length <= maxChars || !current) current = combined;
      else {
        push();
        current = word;
      }
    }
  }
  push();
  return chunks;
}
