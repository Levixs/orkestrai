import { describe, expect, it } from 'vitest';
import { alignRects, distributeRects } from '$lib/components/agent-room/canvas/layout.js';

const a = { id: 'a', x: 0, y: 0, width: 100, height: 50 };
const b = { id: 'b', x: 300, y: 80, width: 200, height: 100 };
const c = { id: 'c', x: 150, y: 400, width: 100, height: 60 };

describe('alignRects', () => {
  it('alinha a esquerda pelo menor x', () => {
    const result = alignRects([a, b, c], 'left');
    expect(result.get('a')?.x).toBe(0);
    expect(result.get('b')?.x).toBe(0);
    expect(result.get('c')?.x).toBe(0);
  });

  it('alinha a direita pela maior borda direita', () => {
    const result = alignRects([a, b, c], 'right');
    expect(result.get('a')?.x).toBe(400); // 500 - 100
    expect(result.get('b')?.x).toBe(300); // 500 - 200
    expect(result.get('c')?.x).toBe(400);
  });

  it('alinha ao topo e a base', () => {
    expect(alignRects([a, b, c], 'top').get('c')?.y).toBe(0);
    expect(alignRects([a, b, c], 'bottom').get('a')?.y).toBe(410); // 460 - 50
  });

  it('centraliza horizontal e vertical', () => {
    const h = alignRects([a, b], 'centerH');
    expect(h.get('a')?.x).toBe(200); // mid 250 - 50
    expect(h.get('b')?.x).toBe(150); // mid 250 - 100
    const v = alignRects([a, b], 'centerV');
    expect(v.get('a')?.y).toBe(65); // mid 90 - 25
    expect(v.get('b')?.y).toBe(40); // mid 90 - 50
  });

  it('um no so nao move nada', () => {
    expect(alignRects([a], 'left').size).toBe(0);
  });
});

describe('distributeRects', () => {
  it('distribui horizontalmente com gaps iguais', () => {
    const result = distributeRects([a, b, c], 'horizontal');
    // span 0..500, total 400, gap = 50
    expect(result.get('a')?.x).toBe(0);
    expect(result.get('c')?.x).toBe(150);
    expect(result.get('b')?.x).toBe(300);
  });

  it('distribui verticalmente com gaps iguais', () => {
    const rects = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 0, y: 150, width: 100, height: 100 },
      { id: 'c', x: 0, y: 500, width: 100, height: 100 },
    ];
    const result = distributeRects(rects, 'vertical');
    // span 0..600, total 300, gap = 150
    expect(result.get('a')?.y).toBe(0);
    expect(result.get('b')?.y).toBe(250);
    expect(result.get('c')?.y).toBe(500);
  });

  it('menos de 3 nos nao distribui', () => {
    expect(distributeRects([a, b], 'horizontal').size).toBe(0);
  });
});

describe('tidyRects', () => {
  it('arranja em grade a partir do canto superior esquerdo', async () => {
    const { tidyRects } = await import('$lib/components/agent-room/canvas/layout.js');
    const rects = [
      { id: 'a', x: 500, y: 300, width: 100, height: 50 },
      { id: 'b', x: 100, y: 100, width: 100, height: 50 },
      { id: 'c', x: 300, y: 200, width: 100, height: 50 },
      { id: 'd', x: 0, y: 0, width: 100, height: 50 },
    ];
    const result = tidyRects(rects, { gap: 24, maxColumns: 2 });
    expect(result.get('d')).toEqual({ x: 0, y: 0 });
    expect(result.get('b')).toEqual({ x: 124, y: 0 });
    expect(result.get('c')?.x).toBe(0);
    expect(result.get('c')!.y).toBeGreaterThan(0);
  });
});

describe('boundingBox', () => {
  it('calcula a caixa envolvente', async () => {
    const { boundingBox } = await import('$lib/components/agent-room/canvas/layout.js');
    const box = boundingBox([
      { id: 'a', x: 10, y: 20, width: 100, height: 50 },
      { id: 'b', x: 200, y: 0, width: 100, height: 80 },
    ]);
    expect(box).toEqual({ x: 10, y: 0, width: 290, height: 80 });
    expect(boundingBox([])).toBeNull();
  });
});
