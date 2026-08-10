export type TerminalCell = { column: number; row: number };

export function terminalCellAtPoint(
  point: { clientX: number; clientY: number },
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  cols: number,
  rows: number,
  viewportY: number
): TerminalCell {
  const column = Math.max(0, Math.min(cols - 1, Math.floor(((point.clientX - rect.left) / rect.width) * cols)));
  const visibleRow = Math.max(0, Math.min(rows - 1, Math.floor(((point.clientY - rect.top) / rect.height) * rows)));
  return { column, row: viewportY + visibleRow };
}

export function terminalSelectionRange(start: TerminalCell, end: TerminalCell, cols: number) {
  const startOffset = start.row * cols + start.column;
  const endOffset = end.row * cols + end.column;
  const first = Math.min(startOffset, endOffset);
  const last = Math.max(startOffset, endOffset);
  return {
    column: first % cols,
    row: Math.floor(first / cols),
    length: last - first + 1,
  };
}
