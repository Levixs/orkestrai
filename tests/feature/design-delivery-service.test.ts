import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { ApplyDesignOperationsDto } from '$lib/modules/agent-room/application/dto/DesignDtos.js';
import { designDeliveryService } from '$lib/modules/agent-room/application/services/DesignDeliveryService.js';
import { designDocumentService } from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import { designOperationSchema } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

const directories: string[] = [];

describe('DesignDeliveryService', () => {
  useSvelarTest({ refreshDatabase: true });

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  async function setup() {
    const directory = mkdtempSync(join(tmpdir(), 'orkestrai-design-delivery-'));
    directories.push(directory);
    const workspace = await workspaceRepository.createWorkspace({ name: 'Delivery', workingDir: directory });
    const node = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'design', title: 'Checkout', payload: {} });
    const initial = await designDocumentService.get(workspace.id, node.id);
    const frameId = crypto.randomUUID();
    const document = await designDocumentService.apply(new ApplyDesignOperationsDto(
      workspace.id,
      node.id,
      initial.revision,
      [designOperationSchema.parse({ kind: 'create', element: { id: frameId, pageId: initial.activePageId, parentId: null, type: 'frame', name: 'Checkout', x: 0, y: 0, width: 390, height: 844 } })],
      { kind: 'user', id: null, name: null, taskId: null },
      'Create checkout frame',
    ));
    return { directory, workspace, node, document, frameId };
  }

  it('previews then atomically writes a generated Svelte file', async () => {
    const { directory, workspace, node, frameId } = await setup();
    const input = { framework: 'svelar' as const, elementIds: [frameId], outputPath: 'src/generated/Checkout.svelte', componentName: 'Checkout' };
    const preview = await designDeliveryService.preview(workspace.id, node.id, input);

    expect(preview).toMatchObject({ status: 'create', existingContent: null, existingHash: null });
    expect(preview.content).toContain('data-design-id');
    const applied = await designDeliveryService.apply(workspace.id, node.id, { ...input, baseRevision: preview.sourceRevision, expectedExistingHash: null });

    expect(applied.artifact).toMatchObject({ path: input.outputPath, framework: 'svelar', elementIds: [frameId] });
    expect(readFileSync(join(directory, input.outputPath), 'utf8')).toBe(applied.content);
    expect(existsSync(`${join(directory, input.outputPath)}.tmp`)).toBe(false);
  });

  it('refuses to overwrite a file changed after preview', async () => {
    const { directory, workspace, node, frameId } = await setup();
    const path = join(directory, 'src/generated/Checkout.svelte');
    const input = { framework: 'svelar' as const, elementIds: [frameId], outputPath: 'src/generated/Checkout.svelte', componentName: 'Checkout' };
    const preview = await designDeliveryService.preview(workspace.id, node.id, input);
    mkdirSync(join(directory, 'src/generated'), { recursive: true });
    writeFileSync(path, '<p>changed externally</p>');

    await expect(designDeliveryService.apply(workspace.id, node.id, { ...input, baseRevision: preview.sourceRevision, expectedExistingHash: preview.existingHash })).rejects.toThrow('changed after preview');
    expect(readFileSync(path, 'utf8')).toBe('<p>changed externally</p>');
  });

  it('keeps output paths inside the workspace and out of managed directories', async () => {
    const { workspace, node, frameId } = await setup();
    const base = { framework: 'html' as const, elementIds: [frameId], componentName: 'Checkout' };

    await expect(designDeliveryService.preview(workspace.id, node.id, { ...base, outputPath: '../escape.html' })).rejects.toThrow('inside the workspace');
    await expect(designDeliveryService.preview(workspace.id, node.id, { ...base, outputPath: '.orkestrai/escape.html' })).rejects.toThrow('cannot be written');
  });

  it('rejects output directories that resolve through a symlink outside the workspace', async () => {
    const { directory, workspace, node, frameId } = await setup();
    const outside = mkdtempSync(join(tmpdir(), 'orkestrai-design-outside-'));
    directories.push(outside);
    const { symlinkSync } = await import('node:fs');
    symlinkSync(outside, join(directory, 'linked-output'));

    await expect(designDeliveryService.preview(workspace.id, node.id, {
      framework: 'html', elementIds: [frameId], componentName: 'Checkout', outputPath: 'linked-output/Checkout.html',
    })).rejects.toThrow('symlink outside');
  });

  it('rejects a write when the design changed after code preview', async () => {
    const { workspace, node, document, frameId } = await setup();
    const input = { framework: 'svelar' as const, elementIds: [frameId], outputPath: 'src/generated/Checkout.svelte', componentName: 'Checkout' };
    const preview = await designDeliveryService.preview(workspace.id, node.id, input);
    await designDocumentService.apply(new ApplyDesignOperationsDto(
      workspace.id,
      node.id,
      document.revision,
      [designOperationSchema.parse({ kind: 'update', elementId: frameId, changes: { name: 'Changed after preview' } })],
      { kind: 'user', id: null, name: null, taskId: null },
      'Change design after preview',
    ));

    await expect(designDeliveryService.apply(workspace.id, node.id, {
      ...input, baseRevision: preview.sourceRevision, expectedExistingHash: preview.existingHash,
    })).rejects.toThrow('design changed after preview');
  });
});
