import type { DesignElement } from '../contracts/schemas/designSchemas.js';

export type DesignViewportBounds = { x: number; y: number; width: number; height: number };

function intersects(element: DesignElement, bounds: DesignViewportBounds): boolean {
  return element.x + element.width >= bounds.x
    && element.y + element.height >= bounds.y
    && element.x <= bounds.x + bounds.width
    && element.y <= bounds.y + bounds.height;
}

export function visibleDesignElements(
  elements: DesignElement[],
  bounds: DesignViewportBounds | null,
  retainedIds: Iterable<string> = [],
  threshold = 500,
): DesignElement[] {
  if (!bounds || elements.length <= threshold) return elements;
  const map = new Map(elements.map((element) => [element.id, element]));
  const retained = new Set(retainedIds);
  const visible = new Set(elements.filter((element) => intersects(element, bounds)).map((element) => element.id));
  for (const id of retained) visible.add(id);

  const preserveDependencies = (element: DesignElement | undefined) => {
    let current = element;
    while (current) {
      visible.add(current.id);
      if (current.maskId) visible.add(current.maskId);
      current = current.parentId ? map.get(current.parentId) : undefined;
    }
  };
  for (const id of [...visible]) preserveDependencies(map.get(id));
  return elements.filter((element) => visible.has(element.id));
}
