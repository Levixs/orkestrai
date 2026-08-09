import { describe, expect, it } from 'vitest';
import { builtinPresetCatalog } from '$lib/modules/agent-room/application/catalogs/BuiltinPresetCatalog.js';
import { builtinRoleCatalog } from '$lib/modules/agent-room/application/catalogs/BuiltinRoleCatalog.js';

describe('builtin team catalogs', () => {
  it('keeps preset ids and recipe structure aligned across locales', () => {
    const pt = builtinPresetCatalog('pt-BR');
    const en = builtinPresetCatalog('en');
    const es = builtinPresetCatalog('es');
    expect(pt.map((item) => item.id)).toEqual(en.map((item) => item.id));
    expect(pt.map((item) => item.id)).toEqual(es.map((item) => item.id));
    expect(pt).toHaveLength(6);
    for (const preset of pt) {
      expect(preset.data.version).toBe(2);
      expect(preset.data.nodes.filter((node) => node.type === 'terminal')).toHaveLength(4);
      expect(preset.data.roles).toHaveLength(4);
      expect(preset.data.skills).toHaveLength(2);
      expect(preset.data.tasks[0].description.length).toBeGreaterThan(40);
      expect(preset.data.nodes.some((node) => node.type === 'tasks')).toBe(true);
    }
  });

  it('keeps role ids/categories aligned and localizes their content', () => {
    const pt = builtinRoleCatalog('pt-BR');
    const en = builtinRoleCatalog('en');
    const es = builtinRoleCatalog('es');
    expect(pt.map((item) => item.id)).toEqual(en.map((item) => item.id));
    expect(pt.map((item) => item.id)).toEqual(es.map((item) => item.id));
    expect(pt).toHaveLength(12);
    expect(new Set(pt.map((item) => item.category))).toEqual(new Set(['leadership', 'engineering', 'quality', 'operations']));
    for (const role of [...pt, ...en, ...es]) {
      expect(role.name.trim().length).toBeGreaterThan(3);
      expect(role.description.trim().length).toBeGreaterThan(20);
      expect(role.prompt.trim().length).toBeGreaterThan(80);
    }
  });
});
