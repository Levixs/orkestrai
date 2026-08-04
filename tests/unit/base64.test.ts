import { describe, expect, it } from 'vitest';
import { arrayBufferToBase64 } from '$lib/components/agent-room/base64.js';

describe('arrayBufferToBase64', () => {
  it('converte buffer pequeno', () => {
    const bytes = new TextEncoder().encode('hello');
    expect(arrayBufferToBase64(bytes.buffer as ArrayBuffer)).toBe(btoa('hello'));
  });

  it('converte imagem grande sem estourar a pilha (spread direto falharia)', () => {
    // 2 MB de bytes pseudo-aleatorios — o caso real de screenshots do kanban
    const bytes = new Uint8Array(2 * 1024 * 1024);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31) % 256;
    const base64 = arrayBufferToBase64(bytes.buffer as ArrayBuffer);
    expect(base64.length).toBe(Math.ceil(bytes.length / 3) * 4);
    expect(atob(base64).length).toBe(bytes.length);
  });

  it('buffer vazio', () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('');
  });
});
