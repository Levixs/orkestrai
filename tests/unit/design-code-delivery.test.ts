import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateDesignCode } from '$lib/modules/agent-room/domain/design-code-generation.js';
import { importMarkupToDesign } from '$lib/modules/agent-room/domain/design-code-import.js';
import { applyDesignOperations } from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import { designDocumentSchema, type DesignDocument } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';

const NOW = '2026-08-17T00:00:00.000Z';

function document(): DesignDocument {
  const pageId = randomUUID();
  const frameId = randomUUID();
  const textId = randomUUID();
  const componentId = randomUUID();
  const propertyId = randomUUID();
  return designDocumentSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    nodeId: randomUUID(),
    workspaceId: randomUUID(),
    name: 'Checkout',
    revision: 7,
    activePageId: pageId,
    pages: [{ id: pageId, name: 'Page 1', width: 1440, height: 1024, order: 0 }],
    elements: [
      { id: frameId, pageId, parentId: null, type: 'frame', name: 'Checkout card', x: 100, y: 80, width: 420, height: 260, order: 0, layoutMode: 'vertical', layoutGap: 16, componentId },
      { id: textId, pageId, parentId: frameId, type: 'text', name: 'Title', x: 124, y: 104, width: 360, height: 44, order: 0, text: 'Complete purchase', fontSize: 28, fontWeight: 700 },
    ],
    components: [{ id: componentId, name: 'Checkout card', rootElementId: frameId, key: 'checkout-card', properties: [{ id: propertyId, name: 'title', type: 'text', targetElementId: textId, defaultValue: 'Complete purchase', preferredValues: [], order: 0 }], codeConnect: { path: 'src/lib/components/CheckoutCard.svelte', framework: 'svelte', exportName: 'CheckoutCard', props: ['title'], hash: 'a'.repeat(64), syncedAt: NOW }, updatedAt: NOW }],
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('Design code delivery domain', () => {
  it('imports HTML, CSS, and Tailwind as editable native hierarchy without executing source', () => {
    const pageId = randomUUID();
    const imported = importMarkupToDesign({
      format: 'html',
      name: 'Pricing card',
      markup: '<section class="flex flex-col gap-4 p-6 rounded-xl bg-[#ffffff]"><h2 class="text-[#112233]">Pro plan</h2><button class="rounded-lg">Start now</button><script>throw new Error("unsafe")</script></section>',
      css: 'section { width: 420px; } h2 { font-size: 28px; font-weight: 700; }',
      pageId,
      parentId: null,
      x: 80,
      y: 90,
      startOrder: 0,
      makeId: randomUUID,
    });

    expect(imported.elements[0]).toMatchObject({ type: 'frame', name: 'Pricing card' });
    expect(imported.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'frame', width: 420, layoutMode: 'vertical', cornerRadius: 12 }),
      expect.objectContaining({ type: 'text', text: 'Pro plan', fontSize: 28, fontWeight: 700 }),
      expect.objectContaining({ type: 'text', text: 'Start now' }),
    ]));
    expect(imported.elements.some((element) => element.text.includes('unsafe'))).toBe(false);
    expect(imported.operations.every((operation) => operation.kind === 'create')).toBe(true);
  });

  it('imports JSX and TSX structure through an ESM-safe parser', () => {
    const imported = importMarkupToDesign({
      format: 'react',
      name: 'React card',
      markup: 'export function Card(): JSX.Element { return <><main className={`grid grid-cols-2 gap-4`}><h1>Hello</h1><UI.Copy>World</UI.Copy></main></> }',
      css: '',
      pageId: randomUUID(),
      parentId: null,
      x: 0,
      y: 0,
      startOrder: 0,
      makeId: randomUUID,
    });

    expect(imported.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'frame', layoutMode: 'grid', layoutGridColumns: 2 }),
      expect.objectContaining({ type: 'text', text: 'Hello' }),
      expect.objectContaining({ type: 'text', text: 'World' }),
    ]));
  });

  it('generates Svelar code and reuses a connected real component', () => {
    const source = document();
    const root = source.elements[0];
    const instanceId = randomUUID();
    const instance = applyDesignOperations(source, [{ kind: 'create-component-instance', componentId: source.components[0].id, instanceId, pageId: root.pageId, parentId: null, x: 600, y: 80 }], NOW);
    const generated = generateDesignCode(instance, { framework: 'svelar', elementIds: [instanceId], outputPath: 'src/routes/checkout/CheckoutPreview.svelte', componentName: 'CheckoutPreview' });

    expect(generated.content).toContain("import CheckoutCard from '../../lib/components/CheckoutCard';");
    expect(generated.content).toContain('<CheckoutCard');
    expect(generated.content).toContain('title="Complete purchase"');
    expect(generated.mappingsUsed).toEqual([expect.objectContaining({ componentId: source.components[0].id, exportName: 'CheckoutCard' })]);
  });

  it('tracks generated artifacts through the shared command bus', () => {
    const source = document();
    const artifact = { id: randomUUID(), name: 'Checkout', path: 'src/Checkout.svelte', framework: 'svelar' as const, elementIds: [source.elements[0].id], sourceRevision: source.revision, contentHash: 'b'.repeat(64), componentMappings: [], generatedAt: NOW };
    const added = applyDesignOperations(source, [{ kind: 'add-code-artifact', artifact }], NOW);
    const updated = applyDesignOperations(added, [{ kind: 'update-code-artifact', artifactId: artifact.id, changes: { contentHash: 'c'.repeat(64) } }], NOW);
    const removed = applyDesignOperations(updated, [{ kind: 'delete-code-artifact', artifactId: artifact.id }], NOW);

    expect(added.codeArtifacts).toEqual([artifact]);
    expect(updated.codeArtifacts[0].contentHash).toBe('c'.repeat(64));
    expect(removed.codeArtifacts).toEqual([]);
  });
});
