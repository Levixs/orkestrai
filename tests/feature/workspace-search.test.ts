import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv7 } from '@beeblock/svelar/support';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { ApplyDesignOperationsDto } from '$lib/modules/agent-room/application/dto/DesignDtos.js';
import { designDocumentService } from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import { WorkspaceSearchDto } from '$lib/modules/agent-room/application/dto/WorkspaceSearchDto.js';
import { WorkspaceSearchService } from '$lib/modules/agent-room/application/services/WorkspaceSearchService.js';
import { designOperationSchema } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { controlCenterService } from '$lib/modules/agent-room/application/services/ControlCenterService.js';

const tempDirectories: string[] = [];

describe('WorkspaceSearchService', () => {
  useSvelarTest({ refreshDatabase: true });

  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('returns cached indexed entities within 150 ms and indexes attachment references', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'search benchmark', workingDir: '/tmp' });
    for (let index = 0; index < 120; index += 1) {
      await workspaceRepository.createNode({
        workspaceId: workspace.id,
        type: 'note',
        title: `Reference note ${index}`,
        payload: index === 87
          ? {
              content: 'Indexed content',
              attachments: [{
                id: '00000000-0000-4000-8000-000000000087',
                kind: 'file',
                name: 'launch-research.pdf',
                path: '.orkestrai/attachments/launch-research.pdf',
                url: null,
                mimeType: 'application/pdf',
                size: 1_024,
              }],
            }
          : { content: `Ordinary content ${index}` },
      });
    }

    const service = new WorkspaceSearchService();
    const query = new WorkspaceSearchDto('launch-research', workspace.id, false, 60);
    await service.search(query);
    const startedAt = performance.now();
    const results = await service.search(query);
    const elapsedMs = performance.now() - startedAt;

    expect(results[0]).toMatchObject({ kind: 'note', title: 'Reference note 87' });
    expect(elapsedMs).toBeLessThan(150);
  });

  it('indexes design components, tokens, and Figma links as artifacts of the same document', async () => {
    const workingDir = mkdtempSync(join(tmpdir(), 'orkestrai-design-search-'));
    tempDirectories.push(workingDir);
    const workspace = await workspaceRepository.createWorkspace({ name: 'Design search', workingDir });
    const node = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'design', title: 'Checkout system', payload: {} });
    const document = await designDocumentService.get(workspace.id, node.id);
    const rootId = uuidv7();
    const componentId = uuidv7();
    const collectionId = uuidv7();
    const modeId = uuidv7();
    const variableId = uuidv7();
    const figmaLinkId = uuidv7();
    await designDocumentService.apply(new ApplyDesignOperationsDto(
      workspace.id,
      node.id,
      document.revision,
      [
        designOperationSchema.parse({ kind: 'create', element: { id: rootId, pageId: document.activePageId, parentId: null, type: 'frame', name: 'Checkout button', x: 20, y: 20, width: 180, height: 48 } }),
        { kind: 'add-component', component: { id: componentId, name: 'Checkout button', description: 'Primary purchase action', rootElementId: rootId, setId: null, variantValues: {}, properties: [], key: 'checkout-button', libraryId: null, librarySourceId: null, codeConnect: null, updatedAt: new Date().toISOString() } },
        { kind: 'add-variable-collection', collection: { id: collectionId, name: 'Commerce', modes: [{ id: modeId, name: 'Default' }], defaultModeId: modeId, order: 0, libraryId: null, librarySourceId: null, codeSource: null } },
        { kind: 'add-variable', variable: { id: variableId, collectionId, name: 'color/purchase', type: 'color', description: 'Purchase action color', values: { [modeId]: { kind: 'color', value: '#2255ff' } }, order: 0, libraryId: null, librarySourceId: null, codeSourceKey: null } },
        { kind: 'add-figma-link', link: { id: figmaLinkId, fileKey: 'CheckoutFigma123', fileName: 'Checkout foundations', url: 'https://www.figma.com/design/CheckoutFigma123/Checkout', sourceNodeIds: ['10:1'], sourceVersion: null, sourceLastModified: null, originX: 120, originY: 120, mappings: {}, baselineHashes: {}, localHashes: {}, imageRefs: {}, pendingPushNodeIds: [], importedAt: new Date().toISOString(), syncedAt: new Date().toISOString() } },
      ],
      { kind: 'user', id: null, name: null, taskId: null },
      'Seed searchable design system',
    ));

    const service = new WorkspaceSearchService();
    const componentResults = await service.search(new WorkspaceSearchDto('checkout button', workspace.id, false, 20));
    const tokenResults = await service.search(new WorkspaceSearchDto('color/purchase', workspace.id, false, 20));
    const figmaResults = await service.search(new WorkspaceSearchDto('Checkout foundations', workspace.id, false, 20));

    expect(componentResults).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'artifact', title: 'Checkout button', nodeId: node.id })]));
    expect(tokenResults).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'artifact', title: 'color/purchase', nodeId: node.id })]));
    expect(figmaResults).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'artifact', title: 'Checkout foundations', nodeId: node.id })]));
  });

  it('searches semantic activity, attention, and durable messages with operators', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'Operations', workingDir: '/tmp' });
    const agent = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'terminal', title: 'Codex reviewer' });
    await controlCenterService.recordActivity({
      workspaceId: workspace.id,
      nodeId: agent.id,
      state: 'error',
      action: 'Tests failed',
      category: 'workflow',
      verb: 'validated',
      objectType: 'test-suite',
      objectTitle: 'Checkout tests failed',
      outcome: 'Two assertions failed.',
      severity: 'error',
      attentionRequired: true,
    });
    await controlCenterService.recordDelivery({
      workspaceId: workspace.id,
      toNodeId: agent.id,
      state: 'failed',
      content: 'Review checkout',
      error: 'Terminal disconnected',
    });

    const service = new WorkspaceSearchService();
    const attention = await service.search(new WorkspaceSearchDto('type:attention checkout', workspace.id, false, 20));
    const errors = await service.search(new WorkspaceSearchDto('has:error agent:"Codex reviewer"', workspace.id, false, 20));
    const failedMessages = await service.search(new WorkspaceSearchDto('type:message status:failed', workspace.id, false, 20));

    expect(attention).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'attention', title: 'Checkout tests failed' })]));
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'activity', title: 'Checkout tests failed' })]));
    expect(failedMessages).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'message', preview: 'Terminal disconnected' })]));
  });
});
