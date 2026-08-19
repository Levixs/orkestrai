export const SHAPE_CLIPBOARD_TYPE = 'application/x-orkestrai-shapes+json';

const MAX_CLIPBOARD_BYTES = 2_000_000;
const MAX_SHAPES = 100;

export type ShapeClipboardEntry<TPayload = Record<string, unknown>> = {
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  payload: TPayload;
};

export function serializeShapeClipboard<TPayload>(shapes: ShapeClipboardEntry<TPayload>[]): string {
  return JSON.stringify({ version: 1, shapes });
}

export function parseShapeClipboard<TPayload = Record<string, unknown>>(raw: string): ShapeClipboardEntry<TPayload>[] {
  if (!raw || raw.length > MAX_CLIPBOARD_BYTES) return [];
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; shapes?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.shapes)) return [];
    return parsed.shapes.flatMap((entry): ShapeClipboardEntry<TPayload>[] => {
      if (!entry || typeof entry !== 'object') return [];
      const shape = entry as Partial<ShapeClipboardEntry<TPayload>>;
      if (![shape.x, shape.y, shape.width, shape.height].every((value) => typeof value === 'number' && Number.isFinite(value))) return [];
      if (!shape.payload || typeof shape.payload !== 'object') return [];
      return [{
        title: typeof shape.title === 'string' ? shape.title : '',
        x: Number(shape.x),
        y: Number(shape.y),
        width: Math.max(60, Number(shape.width)),
        height: Math.max(40, Number(shape.height)),
        payload: structuredClone(shape.payload),
      }];
    }).slice(0, MAX_SHAPES);
  } catch {
    return [];
  }
}

export function offsetShapeClipboard<TPayload>(
  shapes: ShapeClipboardEntry<TPayload>[],
  offset: number,
): ShapeClipboardEntry<TPayload>[] {
  return shapes.map((shape) => ({
    ...shape,
    x: shape.x + offset,
    y: shape.y + offset,
    payload: structuredClone(shape.payload),
  }));
}
