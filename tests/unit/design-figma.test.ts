import { describe, expect, it } from 'vitest';
import {
  convertFigmaSelection,
  convertFigmaStyles,
  convertFigmaVariables,
  figmaLocalElementHash,
  figmaNodeHash,
  parseFigmaUrl,
} from '$lib/modules/agent-room/domain/design-figma.js';
import type { FigmaApiNode } from '$lib/modules/agent-room/infrastructure/figma/FigmaApiClient.js';

function ids() {
  let value = 1;
  return () => `00000000-0000-7000-8000-${String(value++).padStart(12, '0')}`;
}

const component: FigmaApiNode = {
  id: '10:1',
  name: 'Button / Primary',
  type: 'COMPONENT',
  absoluteBoundingBox: { x: 500, y: 300, width: 160, height: 48 },
  fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.3, b: 0.9 } }],
  layoutMode: 'HORIZONTAL',
  itemSpacing: 8,
  componentPropertyDefinitions: { 'Label#10:2': { type: 'TEXT', defaultValue: 'Continue' } },
  children: [{
    id: '10:2',
    name: 'Label',
    type: 'TEXT',
    characters: 'Continue',
    style: { fontSize: 16, fontWeight: 600 },
    absoluteBoundingBox: { x: 540, y: 314, width: 80, height: 20 },
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
    styles: { text: 'S:TEXT' },
  }],
};

describe('Figma native interoperability', () => {
  it('normalizes official design, file and prototype links', () => {
    expect(parseFigmaUrl('https://www.figma.com/design/AbCdEf123/Product?node-id=10-2')).toMatchObject({ fileKey: 'AbCdEf123', nodeId: '10:2' });
    expect(parseFigmaUrl('https://figma.com/file/AbCdEf123/Product').nodeId).toBeNull();
    expect(() => parseFigmaUrl('https://example.com/design/AbCdEf123/Product')).toThrow('figma.com');
  });

  it('converts frames, vectors, components and local instances to native elements', () => {
    const makeId = ids();
    const instance: FigmaApiNode = {
      id: '20:1', name: 'Button instance', type: 'INSTANCE', componentId: '10:1',
      absoluteBoundingBox: { x: 700, y: 300, width: 160, height: 48 },
      children: [{ id: '20:2', name: 'Label', type: 'TEXT', characters: 'Buy', absoluteBoundingBox: { x: 740, y: 314, width: 80, height: 20 } }],
    };
    const vector: FigmaApiNode = {
      id: '30:1', name: 'Icon', type: 'VECTOR', absoluteBoundingBox: { x: 500, y: 400, width: 24, height: 24 },
      fillGeometry: [{ path: 'M 0 0 L 24 0 L 12 24 Z', windingRule: 'NONZERO' }],
    };
    const result = convertFigmaSelection({
      linkId: makeId(), fileKey: 'AbCdEf123', pageId: makeId(), sourceNodes: [component, instance, vector],
      components: { '10:1': { key: 'component-key', description: 'Action button' } }, makeId, now: '2026-08-16T12:00:00.000Z',
    });
    expect(result.components).toHaveLength(1);
    expect(result.components[0].properties[0]).toMatchObject({ name: 'Label', type: 'text', defaultValue: 'Continue' });
    const importedInstance = result.elements.find((element) => element.figmaSource?.nodeId === '20:1');
    expect(importedInstance).toMatchObject({ instanceRootId: importedInstance?.id, instanceOf: result.components[0].id });
    expect(result.elements.some((element) => element.figmaSource?.nodeId === '20:2')).toBe(false);
    expect(result.elements.find((element) => element.figmaSource?.nodeId === '30:1')).toMatchObject({ pathClosed: true });
    expect(result.elements.find((element) => element.figmaSource?.nodeId === '30:1')?.pathPoints.length).toBeGreaterThanOrEqual(3);
  });

  it('imports a Figma page as virtual containment with native root layers', () => {
    const makeId = ids();
    const result = convertFigmaSelection({
      linkId: makeId(), fileKey: 'AbCdEf123', pageId: makeId(), makeId, now: '2026-08-16T12:00:00.000Z',
      sourceNodes: [{ id: '0:1', name: 'Checkout', type: 'CANVAS', children: [{
        id: '10:10', name: 'Desktop', type: 'FRAME', absoluteBoundingBox: { x: 400, y: 300, width: 1440, height: 900 },
      }] }],
    });
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]).toMatchObject({ name: 'Desktop', parentId: null, x: 120, y: 120 });
    expect(result.mappings['0:1']).toBeUndefined();
  });

  it('preserves the published key of external library instances', () => {
    const makeId = ids();
    const result = convertFigmaSelection({
      linkId: makeId(), fileKey: 'AbCdEf123', pageId: makeId(), makeId, now: '2026-08-16T12:00:00.000Z',
      sourceNodes: [{
        id: '40:1', name: 'Library button', type: 'INSTANCE', componentId: '99:1',
        absoluteBoundingBox: { x: 100, y: 100, width: 160, height: 48 },
      }],
      components: { '99:1': { key: 'published-library-key', name: 'Button / Primary' } },
    });
    expect(result.elements[0].figmaSource?.key).toBe('published-library-key');
    expect(result.warnings).toContain('external_library_component_preserved');
  });

  it('converts Figma variables and published styles into native tokens', () => {
    const makeId = ids();
    const linkId = makeId();
    const variables = convertFigmaVariables({ meta: {
      variableCollections: { 'VC:1': { name: 'Theme', modes: [{ modeId: 'M:1', name: 'Light' }] } },
      variables: { 'V:1': { name: 'color/brand', variableCollectionId: 'VC:1', resolvedType: 'COLOR', valuesByMode: { 'M:1': { r: 1, g: 0, b: 0, a: 1 } } } },
    } }, linkId, makeId, '2026-08-16T12:00:00.000Z');
    const styles = convertFigmaStyles({ 'S:TEXT': { name: 'Body', styleType: 'TEXT' } }, [component], linkId, makeId, '2026-08-16T12:00:00.000Z');
    expect(variables.variables[0]).toMatchObject({ name: 'color/brand', type: 'color' });
    expect(styles.variables[0]).toMatchObject({ name: 'Body', type: 'font-size' });
  });

  it('hashes remote data canonically and local elements without persistence metadata', () => {
    expect(figmaNodeHash({ b: 2, a: 1, id: 'first' })).toBe(figmaNodeHash({ id: 'second', a: 1, b: 2 }));
    const makeId = ids();
    const result = convertFigmaSelection({ linkId: makeId(), fileKey: 'AbCdEf123', pageId: makeId(), sourceNodes: [component], makeId, now: '2026-08-16T12:00:00.000Z' });
    const element = result.elements[0];
    expect(figmaLocalElementHash(element)).toBe(figmaLocalElementHash({ ...element, id: makeId(), order: 999, componentId: makeId() }));
  });
});
