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

  it('indexes design components and tokens as artifacts of the same document', async () => {
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
    await designDocumentService.apply(new ApplyDesignOperationsDto(
      workspace.id,
      node.id,
      document.revision,
      [
        designOperationSchema.parse({ kind: 'create', element: { id: rootId, pageId: document.activePageId, parentId: null, type: 'frame', name: 'Checkout button', x: 20, y: 20, width: 180, height: 48 } }),
        { kind: 'add-component', component: { id: componentId, name: 'Checkout button', description: 'Primary purchase action', rootElementId: rootId, setId: null, variantValues: {}, properties: [], key: 'checkout-button', libraryId: null, librarySourceId: null, codeConnect: null, updatedAt: new Date().toISOString() } },
        { kind: 'add-variable-collection', collection: { id: collectionId, name: 'Commerce', modes: [{ id: modeId, name: 'Default' }], defaultModeId: modeId, order: 0, libraryId: null, librarySourceId: null, codeSource: null } },
        { kind: 'add-variable', variable: { id: variableId, collectionId, name: 'color/purchase', type: 'color', description: 'Purchase action color', values: { [modeId]: { kind: 'color', value: '#2255ff' } }, order: 0, libraryId: null, librarySourceId: null, codeSourceKey: null } },
      ],
      { kind: 'user', id: null, name: null, taskId: null },
      'Seed searchable design system',
    ));

    const service = new WorkspaceSearchService();
    const componentResults = await service.search(new WorkspaceSearchDto('checkout button', workspace.id, false, 20));
    const tokenResults = await service.search(new WorkspaceSearchDto('color/purchase', workspace.id, false, 20));

    expect(componentResults).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'artifact', title: 'Checkout button', nodeId: node.id })]));
    expect(tokenResults).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'artifact', title: 'color/purchase', nodeId: node.id })]));
  });
});
