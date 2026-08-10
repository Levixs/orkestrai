import { describe, expect, it } from 'vitest';
import { terminalCellAtPoint, terminalSelectionRange } from '$lib/components/agent-room/terminal-selection.js';

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
});
