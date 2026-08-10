import { describe, expect, it } from 'vitest';
import {
  canvasNodeTypeSchema,
  createCanvasNodeSchema,
} from '$lib/modules/agent-room/contracts/schemas/workspaceSchemas.js';

describe('workspaceSchemas — tipos de nó do canvas', () => {
  it('aceita todos os tipos suportados, incluindo image', () => {
    const types = ['terminal', 'note', 'fileTree', 'editor', 'diff', 'portal', 'loop', 'group', 'shape', 'tasks', 'flow', 'image', 'usage'];
    for (const type of types) {
      expect(canvasNodeTypeSchema.safeParse(type).success).toBe(true);
    }
    expect(canvasNodeTypeSchema.safeParse('video').success).toBe(false);
  });

  it('cria nó de imagem com payload de path', () => {
    const parsed = createCanvasNodeSchema.safeParse({
      type: 'image',
      title: 'Referência',
      x: 10,
      y: 20,
      width: 320,
      height: 240,
      payload: { path: '.orkestrai/images/ref.png' },
    });
    expect(parsed.success).toBe(true);
  });
});
