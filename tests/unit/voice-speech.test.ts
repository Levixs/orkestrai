import { describe, expect, it } from 'vitest';
import { speechChunks } from '$lib/components/agent-room/voice-speech.js';

describe('speechChunks', () => {
  it('mantem sentencas curtas juntas sem ultrapassar o limite', () => {
    const chunks = speechChunks('Primeira frase. Segunda frase! Terceira?', 32);
    expect(chunks).toEqual(['Primeira frase. Segunda frase!', 'Terceira?']);
    expect(chunks.every((chunk) => chunk.length <= 32)).toBe(true);
  });

  it('divide uma sentenca longa por palavras', () => {
    const chunks = speechChunks('uma frase bastante longa para ser sintetizada sem esperar o paragrafo inteiro', 24);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toBe('uma frase bastante longa para ser sintetizada sem esperar o paragrafo inteiro');
    expect(chunks.every((chunk) => chunk.length <= 24)).toBe(true);
  });

  it('normaliza espacos, limita o texto total e ignora vazio', () => {
    expect(speechChunks('   ')).toEqual([]);
    expect(speechChunks(`ola   mundo ${'x'.repeat(2_000)}`).join(' ').length).toBeLessThanOrEqual(1_000);
  });
});
