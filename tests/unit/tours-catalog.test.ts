import { describe, expect, it } from 'vitest';
import { TOURS_PT } from '$lib/components/agent-room/tours/catalog/pt-BR.js';
import { TOURS_EN } from '$lib/components/agent-room/tours/catalog/en.js';
import { TOURS_ES } from '$lib/components/agent-room/tours/catalog/es.js';
import { checkPasses } from '$lib/components/agent-room/tours/checks.js';
import type { Tour, WorkspaceSnapshot } from '$lib/components/agent-room/tours/types.js';

const CATALOGS = { 'pt-BR': TOURS_PT, en: TOURS_EN, es: TOURS_ES };

function createdTitles(tour: Tour): Set<string> {
  const titles = new Set<string>();
  for (const step of tour.steps) {
    if (!step.action) continue;
    if (step.action.kind === 'createAgent' || step.action.kind === 'createNote') titles.add(step.action.title);
    if (step.action.kind === 'createFlow') titles.add(step.action.title);
    if (step.action.kind === 'createPortal') titles.add(step.action.title ?? 'Portal');
  }
  return titles;
}

describe('catalogo de tours (integridade)', () => {
  it('todos os idiomas tem os mesmos tours e passos (ids e ordem)', () => {
    const ptIds = TOURS_PT.map((tour) => tour.id);
    expect(TOURS_EN.map((tour) => tour.id)).toEqual(ptIds);
    expect(TOURS_ES.map((tour) => tour.id)).toEqual(ptIds);
    for (const tour of TOURS_PT) {
      const en = TOURS_EN.find((item) => item.id === tour.id)!;
      const es = TOURS_ES.find((item) => item.id === tour.id)!;
      expect(en.steps.map((step) => step.id)).toEqual(tour.steps.map((step) => step.id));
      expect(es.steps.map((step) => step.id)).toEqual(tour.steps.map((step) => step.id));
    }
  });

  it('todo tour tem 3+ passos, ids de passo unicos e titulo/tagline', () => {
    for (const catalog of Object.values(CATALOGS)) {
      for (const tour of catalog) {
        expect(tour.steps.length).toBeGreaterThanOrEqual(3);
        expect(new Set(tour.steps.map((step) => step.id)).size).toBe(tour.steps.length);
        expect(tour.title.length).toBeGreaterThan(3);
        expect(tour.tagline.length).toBeGreaterThan(10);
      }
    }
  });

  it('acoes connect/task/routine referenciam titulos criados no proprio tour', () => {
    for (const tour of TOURS_PT) {
      const titles = createdTitles(tour);
      for (const step of tour.steps) {
        if (!step.action) continue;
        if (step.action.kind === 'connect') {
          expect(titles.has(step.action.fromTitle) || step.action.fromTitle === step.action.toTitle).toBe(true);
          expect(titles.has(step.action.toTitle) || step.action.fromTitle === step.action.toTitle).toBe(true);
        }
        if (step.action.kind === 'createTask' && step.action.assigneeTitle) {
          expect(titles.has(step.action.assigneeTitle)).toBe(true);
        }
        if (step.action.kind === 'createRoutine') {
          expect(titles.has(step.action.targetTitle)).toBe(true);
        }
      }
    }
  });

  it('checks do tour usam titulos coerentes com as acoes', () => {
    for (const tour of TOURS_PT) {
      const titles = createdTitles(tour);
      for (const step of tour.steps) {
        if (step.check?.kind === 'nodeExists' && step.check.titleIncludes) {
          // nodeExists com titulo: precisa ser algo criado no tour (ou o proprio quadro/portal)
          const allowed = ['Tarefas', 'Tasks'];
          expect(titles.has(step.check.titleIncludes) || allowed.includes(step.check.titleIncludes)).toBe(true);
        }
      }
    }
  });
});

describe('checkPasses', () => {
  const snap: WorkspaceSnapshot = {
    nodes: [
      { id: 'n1', type: 'terminal', title: 'Líder' },
      { id: 'n2', type: 'note', title: 'Briefing' },
      { id: 'n3', type: 'portal', title: 'Portal App' },
      { id: 'n4', type: 'flow', title: 'Pipeline', payload: { run: null },
      },
    ],
    edges: [{ id: 'e1', sourceNodeId: 'n2', targetNodeId: 'n1' }],
    tasks: [{ id: 't1', title: 'Montar o time e começar', status: 'todo' }],
    mcps: [{ name: 'deepwiki' }],
    floors: [{ name: 'feature-nova' }],
    routines: [{ id: 'r1' }],
  };

  it('nodeExists por tipo e titulo', () => {
    expect(checkPasses({ kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Líder' }, snap)).toBe(true);
    expect(checkPasses({ kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Inexistente' }, snap)).toBe(false);
    expect(checkPasses({ kind: 'nodeExists', nodeType: 'portal' }, snap)).toBe(true);
  });

  it('edgeExists em qualquer direcao', () => {
    expect(checkPasses({ kind: 'edgeExists', fromTitle: 'Briefing', toTitle: 'Líder' }, snap)).toBe(true);
    expect(checkPasses({ kind: 'edgeExists', fromTitle: 'Líder', toTitle: 'Briefing' }, snap)).toBe(true);
    expect(checkPasses({ kind: 'edgeExists', fromTitle: 'Briefing', toTitle: 'Portal App' }, snap)).toBe(false);
  });

  it('demais checks: task, mcp, floor, routine, flow', () => {
    expect(checkPasses({ kind: 'taskExists', titleIncludes: 'montar o time' }, snap)).toBe(true);
    expect(checkPasses({ kind: 'mcpInstalled', name: 'deepwiki' }, snap)).toBe(true);
    expect(checkPasses({ kind: 'mcpInstalled', name: 'github' }, snap)).toBe(false);
    expect(checkPasses({ kind: 'floorExists', nameIncludes: 'feature' }, snap)).toBe(true);
    expect(checkPasses({ kind: 'routineExists' }, snap)).toBe(true);
    expect(checkPasses({ kind: 'flowRunFinished' }, snap)).toBe(true);
  });
});
