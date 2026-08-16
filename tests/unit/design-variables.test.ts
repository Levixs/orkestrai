import { describe, expect, it } from 'vitest';
import { applyDesignOperations } from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import {
  designDocumentSchema,
  designOperationSchema,
  type DesignDocument,
  type DesignOperation,
} from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
import { resolveDesignElementVariables, resolveDesignVariableValue } from '$lib/modules/agent-room/domain/design-variables.js';

const WORKSPACE_ID = '00000000-0000-7000-8000-000000000001';
const NODE_ID = '00000000-0000-7000-8000-000000000002';
const DOCUMENT_ID = '00000000-0000-7000-8000-000000000003';
const PAGE_ID = '00000000-0000-7000-8000-000000000004';
const ELEMENT_ID = '00000000-0000-7000-8000-000000000005';
const COLLECTION_ID = '00000000-0000-7000-8000-000000000006';
const LIGHT_ID = '00000000-0000-7000-8000-000000000007';
const DARK_ID = '00000000-0000-7000-8000-000000000008';
const PRIMARY_ID = '00000000-0000-7000-8000-000000000009';
const ALIAS_ID = '00000000-0000-7000-8000-000000000010';
const SPACING_ID = '00000000-0000-7000-8000-000000000011';
const SECOND_COLLECTION_ID = '00000000-0000-7000-8000-000000000012';
const SECOND_MODE_ID = '00000000-0000-7000-8000-000000000013';
const CROSS_COLLECTION_ALIAS_ID = '00000000-0000-7000-8000-000000000014';
const NOW = '2026-08-16T12:00:00.000Z';

function document(): DesignDocument {
  return designDocumentSchema.parse({
    schemaVersion: 1,
    id: DOCUMENT_ID,
    nodeId: NODE_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Token playground',
    revision: 0,
    activePageId: PAGE_ID,
    pages: [{ id: PAGE_ID, name: 'Page 1', width: 1440, height: 1024, background: '#f5f5f3', order: 0 }],
    elements: [{ id: ELEMENT_ID, pageId: PAGE_ID, parentId: null, type: 'rectangle', name: 'Button', x: 20, y: 20, width: 160, height: 48, order: 0 }],
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function seeded(): DesignDocument {
  const operations: DesignOperation[] = [
    designOperationSchema.parse({
      kind: 'add-variable-collection',
      collection: { id: COLLECTION_ID, name: 'Theme', modes: [{ id: LIGHT_ID, name: 'Light' }, { id: DARK_ID, name: 'Dark' }], defaultModeId: LIGHT_ID, order: 0 },
    }),
    designOperationSchema.parse({
      kind: 'add-variable',
      variable: { id: PRIMARY_ID, collectionId: COLLECTION_ID, name: 'color/primary', type: 'color', values: { [LIGHT_ID]: { kind: 'color', value: '#2255ff' }, [DARK_ID]: { kind: 'color', value: '#88aaff' } }, order: 0 },
    }),
    designOperationSchema.parse({
      kind: 'add-variable',
      variable: { id: ALIAS_ID, collectionId: COLLECTION_ID, name: 'color/action', type: 'color', values: { [LIGHT_ID]: { kind: 'alias', variableId: PRIMARY_ID }, [DARK_ID]: { kind: 'alias', variableId: PRIMARY_ID } }, order: 1 },
    }),
    designOperationSchema.parse({
      kind: 'add-variable',
      variable: { id: SPACING_ID, collectionId: COLLECTION_ID, name: 'space/md', type: 'spacing', values: { [LIGHT_ID]: { kind: 'number', value: 16 }, [DARK_ID]: { kind: 'number', value: 18 } }, order: 2 },
    }),
    { kind: 'bind-variable', elementId: ELEMENT_ID, property: 'fill', variableId: ALIAS_ID },
    { kind: 'bind-variable', elementId: ELEMENT_ID, property: 'strokeWidth', variableId: SPACING_ID },
  ];
  return applyDesignOperations(document(), operations, NOW);
}

describe('Design variables', () => {
  it('mantem documentos antigos retrocompativeis', () => {
    const parsed = document();
    expect(parsed.variableCollections).toEqual([]);
    expect(parsed.variables).toEqual([]);
    expect(parsed.activeVariableModes).toEqual({});
    expect(parsed.elements[0].variableBindings).toEqual({});
  });

  it('resolve modes, aliases e bindings sem alterar os valores base', () => {
    const light = seeded();
    expect(resolveDesignVariableValue(light, ALIAS_ID)).toEqual({ kind: 'color', value: '#2255ff' });
    expect(resolveDesignElementVariables(light, light.elements[0])).toMatchObject({
      fill: 'transparent',
      fills: [{ type: 'solid', color: '#2255ff' }],
      strokeWidth: 16,
    });

    const dark = applyDesignOperations(light, [{ kind: 'set-active-variable-mode', collectionId: COLLECTION_ID, modeId: DARK_ID }], NOW);
    expect(resolveDesignElementVariables(dark, dark.elements[0])).toMatchObject({
      fills: [{ type: 'solid', color: '#88aaff' }],
      strokeWidth: 18,
    });
    expect(dark.elements[0].fill).toBe('#ffffff');
  });

  it('bloqueia aliases ciclicos e bindings incompatíveis', () => {
    const current = seeded();
    expect(() => applyDesignOperations(current, [{
      kind: 'update-variable',
      variableId: PRIMARY_ID,
      changes: { values: { [LIGHT_ID]: { kind: 'alias', variableId: ALIAS_ID }, [DARK_ID]: { kind: 'alias', variableId: ALIAS_ID } } },
    }], NOW)).toThrow('cycle');
    expect(() => applyDesignOperations(current, [{ kind: 'bind-variable', elementId: ELEMENT_ID, property: 'fill', variableId: SPACING_ID }], NOW)).toThrow('binding');
  });

  it('remove bindings órfãos junto com a variável', () => {
    const removed = applyDesignOperations(seeded(), [{ kind: 'delete-variable', variableId: ALIAS_ID }], NOW);
    expect(removed.variables.some((variable) => variable.id === ALIAS_ID)).toBe(false);
    expect(removed.elements[0].variableBindings.fill).toBeUndefined();
  });

  it('preserva aliases como valores locais ao excluir a variável referenciada', () => {
    const removed = applyDesignOperations(seeded(), [{ kind: 'delete-variable', variableId: PRIMARY_ID }], NOW);
    const alias = removed.variables.find((variable) => variable.id === ALIAS_ID);
    expect(alias?.values[LIGHT_ID]).toEqual({ kind: 'color', value: '#2255ff' });
    expect(alias?.values[DARK_ID]).toEqual({ kind: 'color', value: '#2255ff' });
    expect(resolveDesignVariableValue(removed, ALIAS_ID)).toEqual({ kind: 'color', value: '#2255ff' });
  });

  it('preserva aliases externos ao excluir uma coleção inteira', () => {
    const current = applyDesignOperations(seeded(), [
      {
        kind: 'add-variable-collection',
        collection: {
          id: SECOND_COLLECTION_ID,
          name: 'Semantic',
          modes: [{ id: SECOND_MODE_ID, name: 'Default' }],
          defaultModeId: SECOND_MODE_ID,
          order: 1,
        },
      },
      {
        kind: 'add-variable',
        variable: {
          id: CROSS_COLLECTION_ALIAS_ID,
          collectionId: SECOND_COLLECTION_ID,
          name: 'color/action',
          type: 'color',
          values: { [SECOND_MODE_ID]: { kind: 'alias', variableId: PRIMARY_ID } },
          order: 0,
        },
      },
    ], NOW);
    const removed = applyDesignOperations(current, [{ kind: 'delete-variable-collection', collectionId: COLLECTION_ID }], NOW);
    const alias = removed.variables.find((variable) => variable.id === CROSS_COLLECTION_ALIAS_ID);
    expect(alias?.values[SECOND_MODE_ID]).toEqual({ kind: 'color', value: '#2255ff' });
    expect(resolveDesignVariableValue(removed, CROSS_COLLECTION_ALIAS_ID)).toEqual({ kind: 'color', value: '#2255ff' });
  });
});
