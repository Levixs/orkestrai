/**
 * ArrayBuffer -> base64 em chunks: `String.fromCharCode(...bytes)` com spread
 * estoura a pilha ("Maximum call stack size exceeded") em imagens reais
 * (>100 KB) — era a causa do anexo de imagem do kanban falhar em silencio.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
