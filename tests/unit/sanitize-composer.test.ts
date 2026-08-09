import { describe, expect, it } from 'vitest';
import { sanitizeComposerText } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.js';

const CTRL_X_CTRL_V = `texto${String.fromCharCode(0x18)}segu${String.fromCharCode(0x16)}ro`;

describe('sanitizeComposerText', () => {
  it('achata newlines (Enter solto = submit parcial no composer)', () => {
    expect(sanitizeComposerText('linha um\nlinha dois\n\nlinha tres')).toBe('linha um linha dois linha tres');
  });

  it('remove bytes de controle (Ctrl+X abriria o editor externo do Claude)', () => {
    expect(sanitizeComposerText(CTRL_X_CTRL_V)).toBe('textoseguro');
    expect(sanitizeComposerText('com tab\t\t  e espacos')).toBe('com tab e espacos');
  });

  it('preserva texto normal, pontuacao e acentos', () => {
    expect(sanitizeComposerText('Oi! Tudo bem — 100%? çãõ 😀')).toBe('Oi! Tudo bem — 100%? çãõ 😀');
  });

  it('nao corta mensagens longas silenciosamente', () => {
    expect(sanitizeComposerText('x'.repeat(9000))).toHaveLength(9000);
  });
});
