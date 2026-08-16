import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { uuidv7 } from '@beeblock/svelar/support';
import { ApplyDesignOperationsDto } from '../dto/DesignDtos.js';
import { designDocumentService } from './DesignDocumentService.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import {
  designLibrarySchema,
  type DesignLibrary,
  type PublishDesignLibraryInput,
} from '../../contracts/schemas/designLibrarySchemas.js';
import type {
  DesignComponent,
  DesignComponentSet,
  DesignDocument,
  DesignElement,
  DesignOperation,
  DesignVariable,
  DesignVariableCollection,
  DesignVariableValue,
} from '../../contracts/schemas/designSchemas.js';

export type DesignLibrarySummary = {
  id: string;
  name: string;
  description: string;
  sourceWorkspaceId: string;
  sourceWorkspaceName: string;
  sourceNodeId: string;
  sourceRevision: number;
  allowedWorkspaceIds: string[];
  components: number;
  variables: number;
  updatedAt: string;
};

function libraryDirectory(root: string): string {
  const directory = resolve(root, '.orkestrai', 'designs', 'libraries');
  if (!directory.startsWith(resolve(root) + sep)) throw new Error('Invalid design library directory.');
  return directory;
}

function libraryPath(root: string, libraryId: string): string {
  return join(libraryDirectory(root), `${libraryId}.json`);
}

function descendants(elements: DesignElement[], rootId: string): DesignElement[] {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of elements) if (element.parentId && ids.has(element.parentId) && !ids.has(element.id)) {
      ids.add(element.id);
      changed = true;
    }
  }
  return elements.filter((element) => ids.has(element.id));
}

function sourceElements(document: DesignDocument): DesignElement[] {
  const ids = new Set<string>();
  for (const component of document.components) for (const element of descendants(document.elements, component.rootElementId)) ids.add(element.id);
  return document.elements.filter((element) => ids.has(element.id));
}

function safeAssetPath(root: string, relativePath: string): string {
  const path = resolve(root, relativePath);
  if (!path.startsWith(resolve(root) + sep)) throw new Error('Invalid design library asset path.');
  return path;
}

function remapValue(value: DesignVariableValue, mapping: Map<string, string>): DesignVariableValue {
  return value.kind === 'alias' ? { kind: 'alias', variableId: mapping.get(value.variableId)! } : structuredClone(value);
}

function omitId<T extends { id: string }>(value: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = value;
  return rest;
}

export class DesignLibraryService {
  private async find(libraryId: string): Promise<{ library: DesignLibrary; sourceRoot: string; sourceWorkspaceName: string }> {
    const workspaces = await workspaceRepository.listWorkspaces();
    for (const workspace of workspaces) {
      try {
        const parsed = designLibrarySchema.parse(JSON.parse(await readFile(libraryPath(workspace.workingDir, libraryId), 'utf8')));
        return { library: parsed, sourceRoot: workspace.workingDir, sourceWorkspaceName: workspace.name };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') continue;
      }
    }
    throw new Error('Design library not found.');
  }

  async list(targetWorkspaceId: string): Promise<DesignLibrarySummary[]> {
    const workspaces = await workspaceRepository.listWorkspaces();
    const summaries: DesignLibrarySummary[] = [];
    for (const workspace of workspaces) {
      let files: string[] = [];
      try {
        files = (await readdir(libraryDirectory(workspace.workingDir), { withFileTypes: true }))
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) => entry.name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[design-library] Failed to list library directory.', error);
      }
      for (const file of files) {
        try {
          const library = designLibrarySchema.parse(JSON.parse(await readFile(join(libraryDirectory(workspace.workingDir), file), 'utf8')));
          if (library.sourceWorkspaceId !== targetWorkspaceId && !library.allowedWorkspaceIds.includes(targetWorkspaceId)) continue;
          summaries.push({
            id: library.id,
            name: library.name,
            description: library.description,
            sourceWorkspaceId: library.sourceWorkspaceId,
            sourceWorkspaceName: workspace.name,
            sourceNodeId: library.sourceNodeId,
            sourceRevision: library.sourceRevision,
            allowedWorkspaceIds: library.allowedWorkspaceIds,
            components: library.components.length,
            variables: library.variables.length,
            updatedAt: library.updatedAt,
          });
        } catch (error) {
          console.error('[design-library] Ignoring invalid library.', error);
        }
      }
    }
    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async publish(workspaceId: string, nodeId: string, input: PublishDesignLibraryInput): Promise<DesignLibrarySummary> {
    const [workspace, document, allWorkspaces] = await Promise.all([
      workspaceRepository.getWorkspace(workspaceId),
      designDocumentService.get(workspaceId, nodeId),
      workspaceRepository.listWorkspaces(),
    ]);
    if (!workspace) throw new Error('Workspace not found.');
    if (!document.components.length && !document.variables.length) throw new Error('Create components or variables before publishing a library.');
    const knownWorkspaceIds = new Set(allWorkspaces.map((candidate) => candidate.id));
    if (input.allowedWorkspaceIds.some((id) => !knownWorkspaceIds.has(id))) throw new Error('An allowed workspace no longer exists.');
    const id = input.libraryId ?? uuidv7();
    let existing: DesignLibrary | null = null;
    try {
      existing = designLibrarySchema.parse(JSON.parse(await readFile(libraryPath(workspace.workingDir, id), 'utf8')));
      if (existing.sourceWorkspaceId !== workspaceId || existing.sourceNodeId !== nodeId) throw new Error('This library belongs to another design document.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && error instanceof Error && !error.message.includes('ENOENT')) throw error;
    }
    const elements = sourceElements(document);
    const elementIds = new Set(elements.map((element) => element.id));
    const assetIds = new Set(elements.map((element) => element.assetId).filter((id): id is string => Boolean(id)));
    const now = new Date().toISOString();
    const library = designLibrarySchema.parse({
      schemaVersion: 1,
      id,
      name: input.name,
      description: input.description,
      sourceWorkspaceId: workspaceId,
      sourceNodeId: nodeId,
      sourceDocumentId: document.id,
      sourceRevision: document.revision,
      allowedWorkspaceIds: [...new Set(input.allowedWorkspaceIds.filter((candidate) => candidate !== workspaceId))],
      variableCollections: structuredClone(document.variableCollections),
      variables: structuredClone(document.variables),
      componentSets: structuredClone(document.componentSets),
      components: structuredClone(document.components),
      elements: structuredClone(elements.filter((element) => elementIds.has(element.id))),
      assets: structuredClone(document.assets.filter((asset) => assetIds.has(asset.id))),
      publishedAt: existing?.publishedAt ?? now,
      updatedAt: now,
    });
    const path = libraryPath(workspace.workingDir, id);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
    return {
      id: library.id,
      name: library.name,
      description: library.description,
      sourceWorkspaceId: workspaceId,
      sourceWorkspaceName: workspace.name,
      sourceNodeId: nodeId,
      sourceRevision: library.sourceRevision,
      allowedWorkspaceIds: library.allowedWorkspaceIds,
      components: library.components.length,
      variables: library.variables.length,
      updatedAt: library.updatedAt,
    };
  }

  async remove(workspaceId: string, nodeId: string, libraryId: string): Promise<void> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace not found.');
    const { library } = await this.find(libraryId);
    if (library.sourceWorkspaceId !== workspaceId || library.sourceNodeId !== nodeId) throw new Error('Only the source design document can remove this library.');
    await rm(libraryPath(workspace.workingDir, libraryId), { force: true });
  }

  async import(workspaceId: string, nodeId: string, libraryId: string, baseRevision: number): Promise<{ document: DesignDocument; synced: boolean }> {
    const [{ library, sourceRoot }, targetWorkspace, current] = await Promise.all([
      this.find(libraryId),
      workspaceRepository.getWorkspace(workspaceId),
      designDocumentService.get(workspaceId, nodeId),
    ]);
    if (!targetWorkspace) throw new Error('Workspace not found.');
    if (library.sourceWorkspaceId !== workspaceId && !library.allowedWorkspaceIds.includes(workspaceId)) throw new Error('This workspace is not allowed to use the design library.');
    const existingLink = current.libraryLinks.find((link) => link.id === library.id);
    const mapping = new Map(Object.entries(existingLink?.mappings ?? {}));
    const reserve = (sourceId: string) => {
      const existing = mapping.get(sourceId);
      if (existing) return existing;
      const id = uuidv7();
      mapping.set(sourceId, id);
      return id;
    };
    for (const collection of library.variableCollections) {
      reserve(collection.id);
      collection.modes.forEach((mode) => reserve(mode.id));
    }
    library.variables.forEach((variable) => reserve(variable.id));
    library.componentSets.forEach((set) => reserve(set.id));
    for (const component of library.components) {
      reserve(component.id);
      component.properties.forEach((property) => reserve(property.id));
    }
    library.elements.forEach((element) => reserve(element.id));
    library.assets.forEach((asset) => reserve(asset.id));

    const operations: DesignOperation[] = [];
    const createdAssetPaths: string[] = [];
    const existingTargetIds = new Set(current.elements.map((element) => element.id));
    for (const component of library.components) {
      const targetRootId = reserve(component.rootElementId);
      if (existingTargetIds.has(targetRootId)) operations.push({ kind: 'delete', elementId: targetRootId });
    }

    for (const asset of library.assets) {
      const id = reserve(asset.id);
      const existing = current.assets.find((candidate) => candidate.id === id);
      const relativePath = existing?.path ?? `.orkestrai/designs/assets/${nodeId}/${id}-${basename(asset.path)}`;
      const targetPath = safeAssetPath(targetWorkspace.workingDir, relativePath);
      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(safeAssetPath(sourceRoot, asset.path), targetPath);
      if (!existing) createdAssetPaths.push(targetPath);
      const remapped = { ...structuredClone(asset), id, path: relativePath };
      if (!existing) operations.push({ kind: 'add-asset', asset: remapped });
    }

    const remappedCollections = library.variableCollections.map((source, index): DesignVariableCollection => ({
      ...structuredClone(source),
      id: reserve(source.id),
      modes: source.modes.map((mode) => ({ ...mode, id: reserve(mode.id) })),
      defaultModeId: reserve(source.defaultModeId),
      order: current.variableCollections.length + index,
      libraryId: library.id,
      librarySourceId: source.id,
      codeSource: null,
    }));
    for (const collection of remappedCollections) {
      const existing = current.variableCollections.find((candidate) => candidate.id === collection.id);
      operations.push(existing
        ? { kind: 'update-variable-collection', collectionId: collection.id, changes: omitId(collection) }
        : { kind: 'add-variable-collection', collection });
    }

    const remappedVariables = library.variables.map((source): DesignVariable => ({
      ...structuredClone(source),
      id: reserve(source.id),
      collectionId: reserve(source.collectionId),
      values: Object.fromEntries(Object.entries(source.values).map(([modeId, value]) => [reserve(modeId), remapValue(value, mapping)])),
      libraryId: library.id,
      librarySourceId: source.id,
      codeSourceKey: null,
    }));
    for (const variable of remappedVariables) {
      const existing = current.variables.find((candidate) => candidate.id === variable.id);
      operations.push(existing
        ? { kind: 'update-variable', variableId: variable.id, changes: omitId(variable) }
        : { kind: 'add-variable', variable });
    }

    const remappedSets = library.componentSets.map((source): DesignComponentSet => ({
      ...structuredClone(source),
      id: reserve(source.id),
      libraryId: library.id,
      librarySourceId: source.id,
    }));
    for (const set of remappedSets) {
      const existing = current.componentSets.find((candidate) => candidate.id === set.id);
      operations.push(existing
        ? { kind: 'update-component-set', componentSetId: set.id, changes: omitId(set) }
        : { kind: 'add-component-set', componentSet: set });
    }

    const maxRight = Math.max(0, ...current.elements.filter((element) => !element.parentId).map((element) => element.x + element.width));
    const sourceLeft = Math.min(...library.components.map((component) => library.elements.find((element) => element.id === component.rootElementId)?.x ?? 0));
    const importDx = maxRight + 120 - sourceLeft;
    const componentRoots = new Map(library.components.map((component) => [component.rootElementId, component]));
    const rootFor = (element: DesignElement) => {
      let currentElement: DesignElement | undefined = element;
      while (currentElement?.parentId) currentElement = library.elements.find((candidate) => candidate.id === currentElement?.parentId);
      return currentElement ?? element;
    };
    const offsets = new Map<string, { dx: number; dy: number }>();
    for (const component of library.components) {
      const source = library.elements.find((element) => element.id === component.rootElementId)!;
      const target = current.elements.find((element) => element.id === reserve(source.id));
      offsets.set(source.id, target ? { dx: target.x - source.x, dy: target.y - source.y } : { dx: importDx, dy: 0 });
    }
    const remappedElements = library.elements.map((source): DesignElement => {
      const sourceRoot = rootFor(source);
      const offset = offsets.get(sourceRoot.id) ?? { dx: importDx, dy: 0 };
      const sourceComponent = componentRoots.get(source.id);
      const componentAlreadyExists = sourceComponent ? current.components.some((component) => component.id === reserve(sourceComponent.id)) : false;
      return {
        ...structuredClone(source),
        id: reserve(source.id),
        pageId: current.activePageId,
        parentId: source.parentId ? reserve(source.parentId) : null,
        x: source.x + offset.dx,
        y: source.y + offset.dy,
        assetId: source.assetId ? reserve(source.assetId) : null,
        maskId: source.maskId ? reserve(source.maskId) : null,
        variableBindings: Object.fromEntries(Object.entries(source.variableBindings).map(([property, variableId]) => [property, reserve(variableId)])),
        componentId: source.componentId && componentAlreadyExists ? reserve(source.componentId) : null,
        instanceOf: source.instanceOf ? reserve(source.instanceOf) : null,
        instanceRootId: source.instanceRootId ? reserve(source.instanceRootId) : null,
        instanceSourceId: source.instanceSourceId ? reserve(source.instanceSourceId) : null,
        instanceProperties: Object.fromEntries(Object.entries(source.instanceProperties).map(([propertyId, value]) => [reserve(propertyId), typeof value === 'string' && mapping.has(value) ? reserve(value) : value])),
        instanceOverrides: Object.fromEntries(Object.entries(source.instanceOverrides).map(([elementId, changes]) => [reserve(elementId), changes])),
        slotAssignments: Object.fromEntries(Object.entries(source.slotAssignments).map(([propertyId, elementIds]) => [reserve(propertyId), elementIds.map(reserve)])),
      };
    });
    for (const element of remappedElements) {
      const { id, order, ...rest } = element;
      operations.push({ kind: 'create', element: { ...rest, id, order } });
    }

    const remappedComponents = library.components.map((source): DesignComponent => ({
      ...structuredClone(source),
      id: reserve(source.id),
      rootElementId: reserve(source.rootElementId),
      setId: source.setId ? reserve(source.setId) : null,
      properties: source.properties.map((property) => ({
        ...structuredClone(property),
        id: reserve(property.id),
        targetElementId: reserve(property.targetElementId),
        defaultValue: property.defaultValue,
        preferredValues: property.preferredValues.map(reserve),
      })),
      key: `${library.id}:${source.key}`,
      libraryId: library.id,
      librarySourceId: source.id,
      codeConnect: null,
    }));
    for (const component of remappedComponents) {
      const existing = current.components.find((candidate) => candidate.id === component.id);
      const { id: _id, rootElementId: _rootElementId, ...changes } = component;
      operations.push(existing
        ? { kind: 'update-component', componentId: component.id, changes }
        : { kind: 'add-component', component });
    }

    const now = new Date().toISOString();
    const link = {
      id: library.id,
      name: library.name,
      sourceWorkspaceId: library.sourceWorkspaceId,
      sourceNodeId: library.sourceNodeId,
      sourceRevision: library.sourceRevision,
      mappings: Object.fromEntries(mapping),
      importedAt: existingLink?.importedAt ?? now,
      syncedAt: now,
    };
    operations.push(existingLink
      ? {
          kind: 'update-library-link',
          libraryId: library.id,
          changes: {
            name: link.name,
            sourceRevision: link.sourceRevision,
            mappings: link.mappings,
            importedAt: link.importedAt,
            syncedAt: link.syncedAt,
          },
        }
      : { kind: 'add-library-link', link });

    try {
      const document = await designDocumentService.apply(new ApplyDesignOperationsDto(
        workspaceId,
        nodeId,
        baseRevision,
        operations,
        { kind: 'user', id: null, name: null, taskId: null },
        existingLink ? `Sync design library ${library.name}` : `Import design library ${library.name}`,
      ));
      return { document, synced: Boolean(existingLink) };
    } catch (error) {
      await Promise.all(createdAssetPaths.map((path) => rm(path, { force: true })));
      throw error;
    }
  }
}

export const designLibraryService = new DesignLibraryService();
