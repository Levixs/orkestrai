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
    expect(pt).toHaveLength(10);
    for (const preset of pt) {
      expect(preset.data.version).toBe(2);
      const agents = preset.data.nodes.filter((node) => node.type === 'terminal');
      expect(agents.length).toBeGreaterThanOrEqual(4);
      expect(preset.data.roles).toHaveLength(agents.length);
      expect(preset.data.roles.every((role) => role.prompt.length > 700)).toBe(true);
      expect(preset.data.skills.length).toBeGreaterThanOrEqual(2);
      expect(preset.data.tasks[0].description.length).toBeGreaterThan(40);
      expect(preset.data.nodes.some((node) => node.type === 'tasks')).toBe(true);
    }
    expect(new Set(pt.map((preset) => preset.category))).toEqual(
      new Set(['product', 'frontend', 'backend', 'creative', 'growth', 'orkestrai'])
    );

    const ptCampaign = pt.find((preset) => preset.id === 'builtin:campaign-launch')!;
    const enCampaign = en.find((preset) => preset.id === 'builtin:campaign-launch')!;
    const esCampaign = es.find((preset) => preset.id === 'builtin:campaign-launch')!;
    expect(ptCampaign.data.skills[0].content).toContain('Leia o briefing compartilhado');
    expect(enCampaign.data.skills[0].content).toContain('Read the shared brief');
    expect(esCampaign.data.skills[0].content).toContain('Lee el briefing compartido');
    expect(ptCampaign.data.taskColumns.map((column) => column.name)).toEqual(['Briefing', 'Planejado', 'Produção', 'Aprovação', 'Publicado']);

    const contributing = pt.find((preset) => preset.id === 'builtin:orkestrai-contributing')!;
    expect(contributing.data.nodes.filter((node) => node.type === 'terminal')).toHaveLength(6);
    expect(contributing.data.nodes.some((node) => node.type === 'flow')).toBe(true);
    expect(contributing.data.taskColumns).toHaveLength(6);
    expect(contributing.data.skills).toHaveLength(6);
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
