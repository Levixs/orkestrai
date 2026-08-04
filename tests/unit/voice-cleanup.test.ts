import { describe, expect, it } from 'vitest';
import { cleanSpeechText } from '$lib/components/agent-room/voice-cleanup.js';

const ESC = '\u001b';

describe('cleanSpeechText', () => {
  it('remove sequencias ANSI de cor/cursor', () => {
    const raw = `${ESC}[32mPronto,${ESC}[0m terminei a tarefa.${ESC}[1;2H`;
    expect(cleanSpeechText(raw)).toBe('Pronto, terminei a tarefa.');
  });

  it('remove OSC (titulo de janela) terminado por BEL', () => {
    const raw = `${ESC}]0;titulo\x07A resposta final.`;
    expect(cleanSpeechText(raw)).toBe('A resposta final.');
  });

  it('remove charset de desenho DEC e controles (os "zeros" invisiveis)', () => {
    // TUI redesenhando moldura: ESC(B + shift-out + desenho numa linha propria
    const raw = `${ESC}(B\x0e0000qqq\x0f\x08\x7f\nA resposta de verdade.`;
    const cleaned = cleanSpeechText(raw);
    expect(cleaned).not.toContain('0000');
    expect(cleaned).toBe('A resposta de verdade.');
  });

  it('fica so com o bloco final de texto (ultima resposta), sem chrome de TUI', () => {
    const raw = [
      'Pergunta do usuario digitada aqui',
      'Read 2 files',
      '────────────────────────',
      'Aqui esta a resposta do agente.',
      'Ela continua nesta linha.',
      '⣾ trabalhando… esc to interrupt · 5.2k tokens · 99% context left',
    ].join('\n');
    expect(cleanSpeechText(raw)).toBe('Aqui esta a resposta do agente. Ela continua nesta linha.');
  });

  it('colapsa linhas repetidas de redraw', () => {
    const raw = 'Mesma resposta.\nMesma resposta.\nMesma resposta.';
    expect(cleanSpeechText(raw)).toBe('Mesma resposta.');
  });

  it('mantem acentos pt-BR e corta em 700 chars', () => {
    const long = `Resposta com acentuação e çedilha. ${'texto '.repeat(200)}`;
    const cleaned = cleanSpeechText(long);
    expect(cleaned.length).toBeLessThanOrEqual(700);
    expect(cleaned).toContain('acentuação');
  });

  it('retorna vazio quando so ha chrome', () => {
    const raw = `${ESC}[2J${ESC}[H────\n⣾ 12k tokens`;
    expect(cleanSpeechText(raw)).toBe('');
  });
});
