/**
 * Voz de volta (TTS pt-BR via sidecar): sintetiza texto e toca no cliente.
 * Fila simples por chamada — respostas nao se atropelam.
 */

let queue: Promise<void> = Promise.resolve();

export function speakText(text: string): Promise<void> {
  const run = queue.then(() => speakOnce(text));
  queue = run.catch(() => {});
  return run;
}

async function speakOnce(text: string): Promise<void> {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return;
  const response = await fetch('/api/agent-room/voice/speak', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: trimmed }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `TTS falhou (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
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
