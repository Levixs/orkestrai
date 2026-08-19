import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv7 } from '@beeblock/svelar/support';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { ApplyDesignOperationsDto } from '$lib/modules/agent-room/application/dto/DesignDtos.js';
import { designDocumentService } from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import { designLibraryService } from '$lib/modules/agent-room/application/services/DesignLibraryService.js';
import { designOperationSchema, type DesignComponent } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

const directories: string[] = [];
const actor = { kind: 'user' as const, id: null, name: null, taskId: null };

describe('DesignLibraryService', () => {
  useSvelarTest({ refreshDatabase: true });

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('publishes, authorizes, imports, and synchronizes linked components', async () => {
    const sourceDirectory = mkdtempSync(join(tmpdir(), 'orkestrai-design-library-source-'));
    const targetDirectory = mkdtempSync(join(tmpdir(), 'orkestrai-design-library-target-'));
    directories.push(sourceDirectory, targetDirectory);
    const sourceWorkspace = await workspaceRepository.createWorkspace({ name: 'Source', workingDir: sourceDirectory });
    const targetWorkspace = await workspaceRepository.createWorkspace({ name: 'Target', workingDir: targetDirectory });
    const sourceNode = await workspaceRepository.createNode({ workspaceId: sourceWorkspace.id, type: 'design', title: 'Foundations', payload: {} });
    const targetNode = await workspaceRepository.createNode({ workspaceId: targetWorkspace.id, type: 'design', title: 'Product', payload: {} });
    const source = await designDocumentService.get(sourceWorkspace.id, sourceNode.id);
    const rootId = uuidv7();
    const componentId = uuidv7();
    const component: DesignComponent = {
      id: componentId,
      name: 'Button',
      description: 'Primary action',
      rootElementId: rootId,
      setId: null,
      variantValues: {},
      properties: [],
      key: 'button-primary',
      libraryId: null,
      librarySourceId: null,
      codeConnect: null,
      updatedAt: new Date().toISOString(),
    };
    const seeded = await designDocumentService.apply(new ApplyDesignOperationsDto(
      sourceWorkspace.id,
      sourceNode.id,
      source.revision,
      [
        designOperationSchema.parse({ kind: 'create', element: { id: rootId, pageId: source.activePageId, parentId: null, type: 'frame', name: 'Button', x: 80, y: 100, width: 180, height: 48, fill: '#2255ff' } }),
        { kind: 'add-component', component },
      ],
      actor,
      'Create source component',
    ));
    const published = await designLibraryService.publish(sourceWorkspace.id, sourceNode.id, {
      libraryId: null,
      name: 'Product foundations',
      description: 'Shared primitives',
      allowedWorkspaceIds: [targetWorkspace.id],
    });

    expect((await designLibraryService.list(targetWorkspace.id))[0]).toMatchObject({ id: published.id, allowedWorkspaceIds: [targetWorkspace.id] });
    const target = await designDocumentService.get(targetWorkspace.id, targetNode.id);
    const imported = await designLibraryService.import(targetWorkspace.id, targetNode.id, published.id, target.revision);
    const importedComponent = imported.document.components.find((candidate) => candidate.libraryId === published.id)!;
    const importedRoot = imported.document.elements.find((element) => element.id === importedComponent.rootElementId)!;
    expect(importedComponent).toMatchObject({ name: 'Button', librarySourceId: componentId, codeConnect: null });
    expect(imported.document.libraryLinks[0]).toMatchObject({ id: published.id, sourceRevision: seeded.revision });

    const moved = await designDocumentService.apply(new ApplyDesignOperationsDto(
      targetWorkspace.id,
      targetNode.id,
      imported.document.revision,
      [{ kind: 'update', elementId: importedRoot.id, changes: { x: 880 } }],
      actor,
      'Move imported source',
    ));
    const changedSource = await designDocumentService.apply(new ApplyDesignOperationsDto(
      sourceWorkspace.id,
      sourceNode.id,
      seeded.revision,
      [{ kind: 'update', elementId: rootId, changes: { fill: '#ff3355' } }],
      actor,
      'Change source component',
    ));
    await designLibraryService.publish(sourceWorkspace.id, sourceNode.id, {
      libraryId: published.id,
      name: published.name,
      description: 'Shared primitives',
      allowedWorkspaceIds: [targetWorkspace.id],
    });
    const synced = await designLibraryService.import(targetWorkspace.id, targetNode.id, published.id, moved.revision);
    expect(synced.synced).toBe(true);
    expect(synced.document.elements.find((element) => element.id === importedRoot.id)).toMatchObject({ x: 880, fill: '#ff3355' });
    expect(synced.document.libraryLinks[0].sourceRevision).toBe(changedSource.revision);

    await expect(designLibraryService.remove(targetWorkspace.id, targetNode.id, published.id)).rejects.toThrow('source design document');
    await expect(designLibraryService.remove(sourceWorkspace.id, sourceNode.id, published.id)).resolves.toBeUndefined();
  });
});
