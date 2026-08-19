import { describe, expect, it } from 'vitest';
import { designDocumentSchema, type DesignDocument } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
import { auditDesignDocument, designContrastRatio } from '$lib/modules/agent-room/domain/design-quality.js';

const ids = Array.from({ length: 8 }, (_, index) => `00000000-0000-7000-8000-00000000000${index + 1}`);

function document(elements: unknown[]): DesignDocument {
  return designDocumentSchema.parse({
    schemaVersion: 1, id: ids[0], nodeId: ids[1], workspaceId: ids[2], name: 'Audit', revision: 4,
    activePageId: ids[3], pages: [{ id: ids[3], name: 'Page', width: 800, height: 600, background: '#ffffff', order: 0 }],
    elements, createdAt: '2026-08-17T12:00:00.000Z', updatedAt: '2026-08-17T12:00:00.000Z',
  });
}

describe('Design quality audit', () => {
  it('detects text clipping, low contrast, generic names, overlap, and missing image labels', () => {
    const report = auditDesignDocument(document([
      { id: ids[4], pageId: ids[3], parentId: null, type: 'text', name: 'Text 1', x: 20, y: 20, width: 120, height: 14, text: 'A long line that wraps more than once', fill: '#bbbbbb', fontSize: 18, order: 0 },
      { id: ids[5], pageId: ids[3], parentId: null, type: 'text', name: 'Text 1', x: 25, y: 22, width: 120, height: 20, text: 'Second text', fill: '#aaaaaa', fontSize: 18, order: 1 },
      { id: ids[6], pageId: ids[3], parentId: null, type: 'image', name: 'Hero art', x: 200, y: 20, width: 200, height: 120, order: 2 },
    ]));

    expect(report.revision).toBe(4);
    expect(report.issues.some((issue) => issue.rule === 'text-clipping')).toBe(true);
    expect(report.issues.some((issue) => issue.rule === 'contrast')).toBe(true);
    expect(report.issues.filter((issue) => issue.rule === 'naming').length).toBeGreaterThanOrEqual(2);
    expect(report.issues.some((issue) => issue.rule === 'overlap')).toBe(true);
    expect(report.issues.some((issue) => issue.rule === 'accessibility' && issue.elementId === ids[6])).toBe(true);
  });

  it('uses WCAG contrast math and accepts labeled or decorative imagery', () => {
    expect(designContrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
    const report = auditDesignDocument(document([
      { id: ids[4], pageId: ids[3], parentId: null, type: 'image', name: 'Hero', x: 20, y: 20, width: 120, height: 80, accessibilityLabel: 'Team collaborating', order: 0 },
      { id: ids[5], pageId: ids[3], parentId: null, type: 'image', name: 'Texture', x: 180, y: 20, width: 120, height: 80, decorative: true, order: 1 },
    ]));
    expect(report.issues.some((issue) => issue.rule === 'accessibility')).toBe(false);
  });

  it('audits thousands of distributed layers without quadratic overlap work', () => {
    const elements = Array.from({ length: 5_000 }, (_, index) => ({
      id: `00000000-0000-7000-8001-${String(index).padStart(12, '0')}`,
      pageId: ids[3], parentId: null, type: 'rectangle', name: `Tile ${index}`,
      x: (index % 100) * 70, y: Math.floor(index / 100) * 70,
      width: 48, height: 48, order: index,
    }));
    const report = auditDesignDocument(document(elements));
    expect(report.auditedElements).toBe(5_000);
    expect(report.issues.some((issue) => issue.rule === 'overlap')).toBe(false);
    expect(report.durationMs).toBeLessThan(1_000);
  });
});
