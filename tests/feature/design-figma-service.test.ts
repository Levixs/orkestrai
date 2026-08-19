import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { designFigmaService } from '$lib/modules/agent-room/application/services/DesignFigmaService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { designDocumentService } from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import { ApplyDesignOperationsDto } from '$lib/modules/agent-room/application/dto/DesignDtos.js';
import { ApplyDesignFigmaSyncDto, PreviewDesignFigmaSyncDto } from '$lib/modules/agent-room/application/dto/DesignFigmaDtos.js';
import { desktopSecretService } from '$lib/modules/agent-room/infrastructure/secrets/DesktopSecretService.js';
import { figmaApiClient } from '$lib/modules/agent-room/infrastructure/figma/FigmaApiClient.js';

describe('DesignFigmaService plugin import', () => {
  useSvelarTest({ refreshDatabase: true });

  it('persists a linked native component and keeps a Figma instance native', async () => {
    const workingDir = mkdtempSync(join(tmpdir(), 'orkestrai-figma-design-'));
    const workspace = await workspaceRepository.createWorkspace({ name: 'Figma import', workingDir });
    const node = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'design', title: 'Checkout', payload: {} });
    const initial = await (await import('$lib/modules/agent-room/application/services/DesignDocumentService.js')).designDocumentService.get(workspace.id, node.id);
    const result = await designFigmaService.importPluginSelection({
      workspaceId: workspace.id,
      nodeId: node.id,
      baseRevision: initial.revision,
      fileKey: 'AbCdEf123',
      fileName: 'Checkout UI',
      imageAssets: {},
      targetPageId: initial.activePageId,
      summary: 'Import checkout button',
      sourceNodes: [
        {
          id: '10:1', name: 'Button', type: 'COMPONENT',
          absoluteBoundingBox: { x: 100, y: 100, width: 160, height: 48 },
          componentPropertyDefinitions: { 'Label#10:2': { type: 'TEXT', defaultValue: 'Continue' } },
          children: [{ id: '10:2', name: 'Label', type: 'TEXT', characters: 'Continue', absoluteBoundingBox: { x: 130, y: 114, width: 100, height: 20 } }],
        },
        {
          id: '20:1', name: 'Button instance', type: 'INSTANCE', componentId: '10:1',
          absoluteBoundingBox: { x: 300, y: 100, width: 160, height: 48 },
          children: [{ id: '20:2', name: 'Label', type: 'TEXT', characters: 'Buy', absoluteBoundingBox: { x: 330, y: 114, width: 100, height: 20 } }],
        },
      ],
    });

    expect(result.document.figmaLinks).toHaveLength(1);
    expect(result.document.components).toHaveLength(1);
    const instance = result.document.elements.find((element) => element.figmaSource?.nodeId === '20:1');
    expect(instance).toMatchObject({ instanceRootId: instance?.id, instanceOf: result.document.components[0].id });
    expect(result.document.elements.some((element) => element.instanceRootId === instance?.id && element.id !== instance?.id)).toBe(true);
    expect(result.document.figmaLinks[0].localHashes['20:1']).toBeTruthy();
    expect(result.document.revision).toBeGreaterThan(initial.revision);
  });

  it('persists image fills sent with a live plugin selection as native assets', async () => {
    const workingDir = mkdtempSync(join(tmpdir(), 'orkestrai-figma-image-'));
    const workspace = await workspaceRepository.createWorkspace({ name: 'Figma image', workingDir });
    const node = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'design', title: 'Campaign', payload: {} });
    const initial = await designDocumentService.get(workspace.id, node.id);
    const result = await designFigmaService.importPluginSelection({
      workspaceId: workspace.id,
      nodeId: node.id,
      baseRevision: initial.revision,
      fileKey: 'ImageFile123',
      fileName: 'Campaign UI',
      targetPageId: initial.activePageId,
      summary: 'Import Figma hero image',
      sourceNodes: [{
        id: '30:1', name: 'Hero image', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 640, height: 360 },
        fills: [{ type: 'IMAGE', imageRef: 'image-hash', scaleMode: 'FILL' }],
      }],
      imageAssets: { 'image-hash': { mimeType: 'image/png', base64: 'iVBORw0KGgo=' } },
    });
    expect(result.counts.assets).toBe(1);
    expect(result.document.assets).toHaveLength(1);
    expect(result.document.elements.find((element) => element.figmaSource?.nodeId === '30:1')).toMatchObject({ type: 'image', assetId: result.document.assets[0].id });
    await expect(designFigmaService.importPluginSelection({
      workspaceId: workspace.id,
      nodeId: node.id,
      baseRevision: result.document.revision,
      fileKey: 'BadImage123',
      fileName: 'Invalid image payload',
      targetPageId: result.document.activePageId,
      summary: 'Reject spoofed image',
      sourceNodes: [{
        id: '31:1', name: 'Invalid image', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 64, height: 64 },
        fills: [{ type: 'IMAGE', imageRef: 'bad-hash', scaleMode: 'FILL' }],
      }],
      imageAssets: { 'bad-hash': { mimeType: 'image/png', base64: 'bm90LWEtcG5n' } },
    })).rejects.toThrow('figma_plugin_asset_type_mismatch');
  });

  it('creates newly discovered remote descendants in parent-first order', async () => {
    const workingDir = mkdtempSync(join(tmpdir(), 'orkestrai-figma-sync-'));
    const workspace = await workspaceRepository.createWorkspace({ name: 'Figma sync', workingDir });
    const node = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'design', title: 'Dashboard', payload: {} });
    const initial = await designDocumentService.get(workspace.id, node.id);
    const source = { id: '10:1', name: 'Dashboard', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 800, height: 600 }, children: [] };
    const imported = await designFigmaService.importPluginSelection({
      workspaceId: workspace.id, nodeId: node.id, baseRevision: initial.revision,
      fileKey: 'AbCdEf123', fileName: 'Dashboard UI', sourceNodes: [source],
      imageAssets: {},
      targetPageId: initial.activePageId, summary: 'Initial Figma import',
    });
    vi.spyOn(desktopSecretService, 'get').mockResolvedValue('token');
    vi.spyOn(figmaApiClient, 'nodes').mockResolvedValue({ nodes: { '10:1': { document: {
      ...source,
      children: [{
        id: '10:2', name: 'Card', type: 'FRAME', absoluteBoundingBox: { x: 40, y: 40, width: 320, height: 180 },
        children: [{ id: '10:3', name: 'Title', type: 'TEXT', characters: 'Revenue', absoluteBoundingBox: { x: 64, y: 64, width: 120, height: 24 } }],
      }],
    } } } });
    const link = imported.document.figmaLinks[0];
    const preview = await designFigmaService.preview(new PreviewDesignFigmaSyncDto(workspace.id, node.id, link.id));
    const pending = preview.changes.filter((change) => change.state !== 'unchanged');
    const result = await designFigmaService.applySync(new ApplyDesignFigmaSyncDto(
      workspace.id,
      node.id,
      link.id,
      preview.revision,
      pending.map((change) => ({ nodeId: change.nodeId, resolution: 'figma' })),
    ));
    const card = result.document.elements.find((element) => element.figmaSource?.nodeId === '10:2');
    const title = result.document.elements.find((element) => element.figmaSource?.nodeId === '10:3');
    expect(card?.parentId).toBe(result.document.figmaLinks[0].mappings['10:1']);
    expect(title?.parentId).toBe(card?.id);
  });

  it('queues reviewed local changes for a selective plugin push and acknowledges them', async () => {
    const workingDir = mkdtempSync(join(tmpdir(), 'orkestrai-figma-push-'));
    const workspace = await workspaceRepository.createWorkspace({ name: 'Figma push', workingDir });
    const node = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'design', title: 'Profile', payload: {} });
    const initial = await designDocumentService.get(workspace.id, node.id);
    const source = { id: '20:1', name: 'Profile', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 600 }, children: [] };
    const imported = await designFigmaService.importPluginSelection({
      workspaceId: workspace.id, nodeId: node.id, baseRevision: initial.revision,
      fileKey: 'ZyXwVu987', fileName: 'Profile UI', sourceNodes: [source],
      imageAssets: {},
      targetPageId: initial.activePageId, summary: 'Initial profile import',
    });
    const linkedElement = imported.document.elements.find((element) => element.figmaSource?.nodeId === '20:1')!;
    const edited = await designDocumentService.apply(new ApplyDesignOperationsDto(
      workspace.id,
      node.id,
      imported.document.revision,
      [{ kind: 'update', elementId: linkedElement.id, changes: { name: 'Profile refined locally' } }],
      { kind: 'user', id: null, name: null, taskId: null },
      'Refine imported frame',
    ));
    vi.spyOn(desktopSecretService, 'get').mockResolvedValue('token');
    vi.spyOn(figmaApiClient, 'nodes').mockResolvedValue({ nodes: { '20:1': { document: source } } });
    const link = edited.figmaLinks[0];
    const preview = await designFigmaService.preview(new PreviewDesignFigmaSyncDto(workspace.id, node.id, link.id));
    expect(preview.changes.find((change) => change.nodeId === '20:1')?.state).toBe('local');
    const synced = await designFigmaService.applySync(new ApplyDesignFigmaSyncDto(
      workspace.id,
      node.id,
      link.id,
      preview.revision,
      [{ nodeId: '20:1', resolution: 'local' }],
    ));
    expect(synced.document.figmaLinks[0].pendingPushNodeIds).toEqual(['20:1']);
    const acknowledged = await designFigmaService.acknowledgePush(workspace.id, node.id, link.id, synced.document.revision, ['20:1']);
    expect(acknowledged.figmaLinks[0].pendingPushNodeIds).toEqual([]);
  });
});
