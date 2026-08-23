import { describe, expect, it } from 'vitest';
import { isTerminalCopyShortcut, terminalCellAtPoint, terminalSelectionRange } from '$lib/components/agent-room/terminal-selection.js';

describe('terminal selection geometry', () => {
  it('mapeia coordenadas pelo retangulo visual escalado', () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    expect(terminalCellAtPoint({ clientX: 300, clientY: 150 }, rect, 80, 20, 40)).toEqual({ column: 40, row: 50 });
  });

  it('normaliza selecao reversa em varias linhas', () => {
    expect(terminalSelectionRange({ column: 10, row: 8 }, { column: 5, row: 6 }, 80)).toEqual({
      column: 5,
      row: 6,
      length: 166,
    });
  });

  it('copia com Ctrl/Cmd+C somente quando ha selecao e preserva SIGINT sem selecao', () => {
    const event = { type: 'keydown', key: 'c', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
    expect(isTerminalCopyShortcut(event, true)).toBe(true);
    expect(isTerminalCopyShortcut(event, false)).toBe(false);
    expect(isTerminalCopyShortcut({ ...event, key: 'x' }, true)).toBe(false);
    expect(isTerminalCopyShortcut({ ...event, type: 'keyup' }, true)).toBe(false);
  });
});
