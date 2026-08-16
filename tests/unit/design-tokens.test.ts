import { describe, expect, it } from 'vitest';
import { designDocumentSchema, type DesignDocument } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
import {
  auditDesignSystem,
  createDesignTokenPreset,
  exportDesignTokensCss,
  exportDesignTokensDtcg,
  exportDesignTokensTailwind,
  importDesignTokens,
} from '$lib/modules/agent-room/domain/design-tokens.js';

let idCounter = 1;
const makeId = () => `00000000-0000-7000-8000-${String(idCounter++).padStart(12, '0')}`;

function document(): DesignDocument {
  const preset = createDesignTokenPreset('product', makeId);
  const pageId = makeId();
  return designDocumentSchema.parse({
    schemaVersion: 1,
    id: makeId(),
    nodeId: makeId(),
    workspaceId: makeId(),
    name: 'Tokens',
    revision: 0,
    activePageId: pageId,
    pages: [{ id: pageId, name: 'Page 1', width: 800, height: 600, order: 0 }],
    elements: [
      { id: makeId(), pageId, parentId: null, type: 'frame', name: 'Card A', x: 0, y: 0, width: 200, height: 100, fill: '#ffffff', cornerRadius: 8, order: 0 },
      { id: makeId(), pageId, parentId: null, type: 'frame', name: 'Card B', x: 220, y: 0, width: 200, height: 100, fill: '#ffffff', cornerRadius: 8, order: 1 },
    ],
    variableCollections: [preset.collection],
    variables: preset.variables,
    activeVariableModes: { [preset.collection.id]: preset.collection.defaultModeId },
    createdAt: '2026-08-16T19:00:00.000Z',
    updatedAt: '2026-08-16T19:00:00.000Z',
  });
}

describe('Design tokens import, export and audit', () => {
  it('cria presets multimodo prontos para uso', () => {
    idCounter = 1;
    const preset = createDesignTokenPreset('mobile', makeId);
    expect(preset.collection.modes.map((mode) => mode.name)).toEqual(['Light', 'Dark']);
    expect(preset.variables.some((variable) => variable.name === 'breakpoint/tablet')).toBe(true);
    expect(preset.variables.every((variable) => Object.keys(variable.values).length === 2)).toBe(true);
  });

  it('importa DTCG moderno, aliases, modos e CSS variables', () => {
    idCounter = 100;
    const dtcg = importDesignTokens(JSON.stringify({
      $extensions: { 'com.orkestrai': { collectionName: 'Theme', modes: ['Light', 'Dark'] } },
      tokens: {
        color: {
          brand: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.8], alpha: 1 }, $extensions: { 'com.orkestrai': { values: { Dark: '#88aaff' } } } },
          action: { $type: 'color', $value: '{color.brand}' },
        },
      },
    }), 'theme.tokens.json', makeId);
    expect(dtcg.collection.name).toBe('Theme');
    expect(dtcg.variables[0].values[dtcg.collection.defaultModeId]).toEqual({ kind: 'color', value: '#3366ccff' });
    expect(dtcg.variables[1].values[dtcg.collection.defaultModeId]).toMatchObject({ kind: 'alias' });

    const css = importDesignTokens(':root { --space-md: 1rem; --brand-color: #ff3355; }', 'tokens.css', makeId);
    expect(css.variables.find((variable) => variable.name === 'space/md')?.values[css.collection.defaultModeId]).toEqual({ kind: 'number', value: 16 });
    expect(css.variables.find((variable) => variable.name === 'brand/color')?.type).toBe('color');
  });

  it('exporta DTCG, CSS variables e configuração Tailwind', () => {
    idCounter = 300;
    const current = document();
    const collectionId = current.variableCollections[0].id;
    const dtcg = exportDesignTokensDtcg(current, collectionId);
    const css = exportDesignTokensCss(current, collectionId);
    const tailwind = exportDesignTokensTailwind(current, collectionId);
    expect(dtcg).toContain('com.orkestrai');
    expect(css).toContain('--color-background: #ffffff;');
    expect(tailwind).toContain('borderRadius');
  });

  it('audita valores repetidos, tokens não usados e candidatos a componente', () => {
    idCounter = 500;
    const current = document();
    const audit = auditDesignSystem(current);
    expect(audit.unusedVariableIds.length).toBe(current.variables.length);
    expect(audit.hardcodedValues.some((group) => group.property === 'fill' && group.elementIds.length === 2)).toBe(true);
    expect(audit.componentCandidates).toHaveLength(1);
  });
});
