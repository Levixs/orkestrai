import { describe, expect, it } from 'vitest';
import { CreateDesignExplorationDto } from '$lib/modules/agent-room/application/dto/CreateDesignExplorationDto.js';
import {
  designExplorationBrief,
  designExplorationLayout,
  isDesignExplorationPayload,
} from '$lib/modules/agent-room/domain/design-exploration.js';
import { createDesignExplorationSchema } from '$lib/modules/agent-room/contracts/schemas/create-design-exploration.schema.js';
import type { CanvasNode } from '$lib/modules/agent-room/domain/types.js';

function input(locale: 'pt-BR' | 'en' | 'es' = 'en') {
  return createDesignExplorationSchema.parse({
    title: 'Checkout redesign',
    objective: 'Reduce checkout abandonment without hiding delivery costs.',
    audience: 'Returning mobile customers',
    platform: 'responsive-web',
    codeTarget: 'svelar',
    constraints: 'Keep the existing payment API.',
    references: 'Current checkout and support tickets.',
    includeDarkMode: true,
    executionMode: 'manual',
    locale,
  });
}

describe('design exploration workflow', () => {
  it('recognizes both current and legacy exploration payloads', () => {
    expect(isDesignExplorationPayload({ workflowKind: 'design-exploration' })).toBe(true);
    expect(isDesignExplorationPayload({ explorationId: 'legacy-exploration' })).toBe(true);
    expect(isDesignExplorationPayload({ workflowKind: 'other' })).toBe(false);
  });

  it('validates delegation and keeps manual creation independent from a leader', () => {
    expect(createDesignExplorationSchema.safeParse(input()).success).toBe(true);
    expect(createDesignExplorationSchema.safeParse({ ...input(), executionMode: 'leader' }).success).toBe(false);
    expect(createDesignExplorationSchema.safeParse({
      ...input(),
      executionMode: 'leader',
      leaderNodeId: '019fd75e-a7a4-7460-84c6-33f1d6457af0',
    }).success).toBe(true);
  });

  it('builds a localized brief with a small concept gate before complete delivery', () => {
    const brief = designExplorationBrief(CreateDesignExplorationDto.from(input('es')), 'note-1');
    expect(brief).toContain('UI A - Claridad');
    expect(brief).toContain('UI B - Expresiva');
    expect(brief).toContain('UI C - Eficiente');
    expect(brief).toContain('Tokens tipados');
    expect(brief).toContain('30-120 capas útiles');
    expect(brief).toContain('Inspección visual humana');
    expect(brief).toContain('Vista previa de código');
    expect(brief).toContain('note-1');
    expect(brief).not.toContain('lista de arquivos');
  });

  it('places the package below existing nodes without overlapping their vertical extent', () => {
    const existing = [{ x: 100, y: 200, width: 400, height: 300, type: 'terminal' }] as CanvasNode[];
    const layout = designExplorationLayout(existing);
    expect(layout.baseY).toBe(660);
    expect(layout.note.y).toBeGreaterThan(500);
    expect(layout.designs).toHaveLength(3);
    expect(layout.designs[1].x).toBeGreaterThan(layout.designs[0].x + layout.designs[0].width);
    expect(layout.group.width).toBeGreaterThan(1_600);
  });
});
