import { describe, expect, it } from 'vitest';
import {
  offsetShapeClipboard,
  parseShapeClipboard,
  serializeShapeClipboard,
  type ShapeClipboardEntry,
} from '../../src/lib/components/agent-room/canvas/shape-clipboard.js';

describe('shape clipboard', () => {
  const shapes: ShapeClipboardEntry[] = [
    {
      title: 'Card',
      x: 100,
      y: 80,
      width: 240.5,
      height: 120.25,
      payload: { shape: 'rounded', fill: '#3dd68c', label: 'Draft' },
    },
    {
      title: 'Flow',
      x: 420,
      y: 155,
      width: 300,
      height: 90,
      payload: { shape: 'arrow', stroke: '#FFC857', points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.2 }] },
    },
  ];

  it('round-trips a multi-selection without losing geometry or style', () => {
    expect(parseShapeClipboard(serializeShapeClipboard(shapes))).toEqual(shapes);
  });

  it('offsets the arrangement while preserving relative spacing and source data', () => {
    const copies = offsetShapeClipboard(shapes, 24);
    expect(copies.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 124, y: 104 }, { x: 444, y: 179 }]);
    expect(copies[1].x - copies[0].x).toBe(shapes[1].x - shapes[0].x);
    expect(copies[1].y - copies[0].y).toBe(shapes[1].y - shapes[0].y);
    copies[1].payload.shape = 'ellipse';
    expect(shapes[1].payload.shape).toBe('arrow');
  });

  it('rejects invalid or oversized clipboard data and clamps minimum dimensions', () => {
    expect(parseShapeClipboard('{"version":2,"shapes":[]}')).toEqual([]);
    expect(parseShapeClipboard('x'.repeat(2_000_001))).toEqual([]);
    expect(parseShapeClipboard(JSON.stringify({
      version: 1,
      shapes: [{ title: 'Tiny', x: 0, y: 0, width: 1, height: 2, payload: { shape: 'rectangle' } }],
    }))[0]).toMatchObject({ width: 60, height: 40 });
  });
});
