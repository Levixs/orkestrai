import { describe, expect, it } from 'vitest';
import { designElementSchema } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
import { visibleDesignElements } from '$lib/modules/agent-room/domain/design-viewport.js';

const PAGE = '00000000-0000-7000-8000-000000000001';
const parentId = '00000000-0000-7000-8000-000000000002';
const childId = '00000000-0000-7000-8000-000000000003';

function item(id: string, x: number, parent: string | null = null) {
  return designElementSchema.parse({ id, pageId: PAGE, parentId: parent, type: 'rectangle', name: id, x, y: 0, width: 50, height: 50, order: x });
}

describe('incremental Design rendering', () => {
  it('culls distant layers while preserving parents and selected layers', () => {
    const elements = [item(parentId, 1000), item(childId, 10, parentId)];
    for (let index = 0; index < 600; index += 1) elements.push(item(`00000000-0000-7000-8000-${String(index + 10).padStart(12, '0')}`, 2000 + index * 60));
    const visible = visibleDesignElements(elements, { x: 0, y: 0, width: 200, height: 200 }, [], 500);
    expect(visible.map((element) => element.id)).toEqual([parentId, childId]);

    const retained = visibleDesignElements(elements, { x: 0, y: 0, width: 200, height: 200 }, [elements.at(-1)!.id], 500);
    expect(retained.some((element) => element.id === elements.at(-1)!.id)).toBe(true);
  });
});
