import { describe, expect, it } from 'vitest';
import { applyDesignOperations } from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import { designDocumentSchema, designOperationSchema, type DesignDocument } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';

const WORKSPACE_ID = '00000000-0000-7000-8000-000000000001';
const NODE_ID = '00000000-0000-7000-8000-000000000002';
const DOCUMENT_ID = '00000000-0000-7000-8000-000000000003';
const PAGE_ID = '00000000-0000-7000-8000-000000000004';
const FRAME_ID = '00000000-0000-7000-8000-000000000005';
const TEXT_ID = '00000000-0000-7000-8000-000000000006';
const NOW = '2026-08-16T12:00:00.000Z';

function document(): DesignDocument {
  return designDocumentSchema.parse({
    schemaVersion: 1,
    id: DOCUMENT_ID,
    nodeId: NODE_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Checkout',
    revision: 0,
    activePageId: PAGE_ID,
    pages: [{ id: PAGE_ID, name: 'Page 1', width: 1440, height: 1024, background: '#f5f5f3', order: 0 }],
    elements: [],
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('documento de Design', () => {
  it('aplica criacao e atualizacao tipadas sem perder defaults', () => {
    const created = applyDesignOperations(document(), [designOperationSchema.parse({
      kind: 'create',
      element: {
        id: FRAME_ID,
        pageId: PAGE_ID,
        parentId: null,
        type: 'frame',
        name: 'Mobile',
        x: 20,
        y: 20,
        width: 390,
        height: 844,
      },
    })], NOW);

    expect(created.elements[0]).toMatchObject({ id: FRAME_ID, fill: '#ffffff', visible: true, order: 0 });
    const updated = applyDesignOperations(created, [{
      kind: 'update',
      elementId: FRAME_ID,
      changes: { x: 48, cornerRadius: 24 },
    }], NOW);
    expect(updated.elements[0]).toMatchObject({ x: 48, cornerRadius: 24 });
  });

  it('remove descendentes junto com o elemento pai', () => {
    const populated = designDocumentSchema.parse({
      ...document(),
      elements: [
        { id: FRAME_ID, pageId: PAGE_ID, parentId: null, type: 'frame', name: 'Frame', x: 0, y: 0, width: 300, height: 500, order: 0 },
        { id: TEXT_ID, pageId: PAGE_ID, parentId: FRAME_ID, type: 'text', name: 'Title', x: 20, y: 20, width: 200, height: 40, order: 0, text: 'Hello' },
      ],
    });
    const deleted = applyDesignOperations(populated, [{ kind: 'delete', elementId: FRAME_ID }], NOW);
    expect(deleted.elements).toEqual([]);
  });

  it('protege elementos bloqueados contra mutacoes acidentais', () => {
    const populated = designDocumentSchema.parse({
      ...document(),
      elements: [
        { id: FRAME_ID, pageId: PAGE_ID, parentId: null, type: 'frame', name: 'Locked', x: 0, y: 0, width: 300, height: 500, order: 0, locked: true },
      ],
    });
    expect(() => applyDesignOperations(populated, [{
      kind: 'update',
      elementId: FRAME_ID,
      changes: { x: 10 },
    }], NOW)).toThrow('locked');
    expect(() => applyDesignOperations(populated, [{
      kind: 'reorder',
      elementId: FRAME_ID,
      order: 4,
    }], NOW)).toThrow('locked');
  });

  it('permite filhos somente dentro de frames da mesma pagina', () => {
    const populated = designDocumentSchema.parse({
      ...document(),
      elements: [
        { id: TEXT_ID, pageId: PAGE_ID, parentId: null, type: 'text', name: 'Title', x: 20, y: 20, width: 200, height: 40, order: 0, text: 'Hello' },
      ],
    });
    expect(() => applyDesignOperations(populated, [designOperationSchema.parse({
      kind: 'create',
      element: { pageId: PAGE_ID, parentId: TEXT_ID, type: 'rectangle', name: 'Invalid child', x: 0, y: 0, width: 20, height: 20 },
    })], NOW)).toThrow('Only frames');
  });

  it('renomeia o documento sem alterar o conteudo visual', () => {
    const renamed = applyDesignOperations(document(), [{ kind: 'rename-document', name: 'Design system' }], NOW);

    expect(renamed.name).toBe('Design system');
    expect(renamed.elements).toEqual([]);
    expect(renamed.updatedAt).toBe(NOW);
  });
});
