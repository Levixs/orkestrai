import { describe, expect, it } from 'vitest';
import { comboFromEvent, comboLabel, matchesCombo } from '$lib/components/agent-room/dictation-hotkey.js';

function event(partial: Partial<KeyboardEvent>): KeyboardEvent {
  return { code: 'Space', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...partial } as KeyboardEvent;
}

describe('dictation-hotkey', () => {
  it('monta combo a partir do keydown', () => {
    expect(comboFromEvent(event({ code: 'Space', altKey: true }))).toBe('alt+space');
    expect(comboFromEvent(event({ code: 'KeyD', ctrlKey: true, shiftKey: true }))).toBe('ctrl+shift+keyd');
    expect(comboFromEvent(event({ code: 'F5', metaKey: true }))).toBe('meta+f5');
  });

  it('ignora modificador puro', () => {
    expect(comboFromEvent(event({ code: 'AltLeft', altKey: true }))).toBeNull();
    expect(comboFromEvent(event({ code: 'ShiftRight', shiftKey: true }))).toBeNull();
  });

  it('matchesCombo exige correspondencia exata dos modificadores', () => {
    expect(matchesCombo(event({ code: 'Space', altKey: true }), 'alt+space')).toBe(true);
    // modificador a mais nao casa
    expect(matchesCombo(event({ code: 'Space', altKey: true, shiftKey: true }), 'alt+space')).toBe(false);
    // modificador faltando nao casa
    expect(matchesCombo(event({ code: 'Space' }), 'alt+space')).toBe(false);
    // tecla diferente nao casa
    expect(matchesCombo(event({ code: 'KeyA', altKey: true }), 'alt+space')).toBe(false);
    expect(matchesCombo(event({ code: 'KeyD', ctrlKey: true, shiftKey: true }), 'ctrl+shift+keyd')).toBe(true);
  });

  it('comboLabel formata para exibicao', () => {
    expect(comboLabel('alt+space')).toBe('Alt+Espaco');
    expect(comboLabel('ctrl+shift+keyd')).toBe('Ctrl+Shift+D');
    expect(comboLabel('meta+f5')).toBe('Cmd+F5');
    expect(comboLabel('digit3')).toBe('3');
    expect(comboLabel('shift+arrowup')).toBe('Shift+↑');
  });
});
