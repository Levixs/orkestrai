import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { uuidv7 } from '@beeblock/svelar/support';
import {
  designDocumentSchema,
  type DesignAsset,
  type DesignBindableProperty,
  type DesignComponent,
  type DesignComponentProperty,
  type DesignDocument,
  type DesignElement,
  type DesignOperation,
  type DesignVariable,
  type DesignVariableType,
  type DesignVariableValue,
} from '../../contracts/schemas/designSchemas.js';
import type { ApplyDesignOperationsDto } from '../dto/DesignDtos.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { resolveDesignVariableValue } from '../../domain/design-variables.js';

export class DesignRevisionConflictError extends Error {
  constructor(public readonly current: DesignDocument) {
    super(`Design revision conflict. Expected ${current.revision}.`);
    this.name = 'DesignRevisionConflictError';
  }
}

type DesignServiceGlobals = typeof globalThis & {
  __orkestraiDesignMutationQueues?: Map<string, Promise<void>>;
};

function mutationQueues(): Map<string, Promise<void>> {
  const globals = globalThis as DesignServiceGlobals;
  return globals.__orkestraiDesignMutationQueues ??= new Map<string, Promise<void>>();
}

function broadcastDesignChanged(workspaceId: string, nodeId: string, revision: number): void {
  const broadcast = (globalThis as {
    __orkestraiBroadcast?: (payload: Record<string, unknown>) => void;
  }).__orkestraiBroadcast;
  broadcast?.({ type: 'designChanged', workspaceId, nodeId, revision });
}

function sortElements(elements: DesignElement[]): DesignElement[] {
  return [...elements].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function safeAssetFilename(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120);
  return normalized || 'asset';
}

function assetMimeType(name: string, declared: string): DesignAsset['mimeType'] {
  const extension = name.split('.').at(-1)?.toLowerCase();
  const byExtension: Partial<Record<string, DesignAsset['mimeType']>> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
  };
  const canonical = extension ? byExtension[extension] : undefined;
  const allowed = new Set<DesignAsset['mimeType']>(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
  if (!canonical || (declared && !allowed.has(declared as DesignAsset['mimeType']))) throw new Error('Unsupported design asset type.');
  if (declared && declared !== canonical && !(canonical === 'image/jpeg' && declared === 'image/jpg')) {
    throw new Error('Design asset type does not match its filename.');
  }
  return canonical;
}

function valueKindForType(type: DesignVariableType): Exclude<DesignVariableValue['kind'], 'alias'> {
  if (type === 'color') return 'color';
  if (type === 'effect') return 'effect';
  if (type === 'string') return 'string';
  if (type === 'boolean') return 'boolean';
  return 'number';
}

function compatibleVariableTypes(property: DesignBindableProperty): DesignVariableType[] {
  if (property === 'fill' || property === 'stroke') return ['color'];
  if (property === 'effects') return ['effect'];
  if (property === 'opacity') return ['opacity'];
  if (property === 'cornerRadius') return ['radius'];
  if (property === 'fontSize') return ['font-size'];
  if (property === 'fontWeight') return ['font-weight'];
  return ['spacing'];
}

function validateVariableValue(variable: DesignVariable, value: DesignVariableValue): void {
  if (value.kind === 'alias') return;
  if (value.kind !== valueKindForType(variable.type)) throw new Error(`Invalid value for ${variable.type} variable.`);
  if (value.kind !== 'number') return;
  if (variable.type === 'opacity' && (value.value < 0 || value.value > 1)) throw new Error('Opacity variables must be between 0 and 1.');
  if (variable.type === 'font-weight' && (value.value < 100 || value.value > 900)) throw new Error('Font weight variables must be between 100 and 900.');
  if (['spacing', 'radius', 'font-size', 'line-height', 'breakpoint'].includes(variable.type) && value.value < 0) {
    throw new Error(`${variable.type} variables cannot be negative.`);
  }
}

function validateDesignVariables(document: DesignDocument): void {
  const collections = new Map(document.variableCollections.map((collection) => [collection.id, collection]));
  if (collections.size !== document.variableCollections.length) throw new Error('Design variable collection ids must be unique.');
  const allModeIds = new Set<string>();
  for (const collection of document.variableCollections) {
    const modeIds = new Set(collection.modes.map((mode) => mode.id));
    if (modeIds.size !== collection.modes.length) throw new Error('Design variable mode ids must be unique.');
    if (!modeIds.has(collection.defaultModeId)) throw new Error('The default design variable mode is missing.');
    for (const modeId of modeIds) {
      if (allModeIds.has(modeId)) throw new Error('Design variable mode ids must be unique across the document.');
      allModeIds.add(modeId);
    }
    const activeModeId = document.activeVariableModes[collection.id];
    if (activeModeId && !modeIds.has(activeModeId)) throw new Error('The active design variable mode is invalid.');
  }
  for (const collectionId of Object.keys(document.activeVariableModes)) {
    if (!collections.has(collectionId)) throw new Error('The active design variable collection is invalid.');
  }

  const variables = new Map(document.variables.map((variable) => [variable.id, variable]));
  if (variables.size !== document.variables.length) throw new Error('Design variable ids must be unique.');
  const names = new Set<string>();
  for (const variable of document.variables) {
    const collection = collections.get(variable.collectionId);
    if (!collection) throw new Error('Design variable collection not found.');
    const nameKey = `${variable.collectionId}:${variable.name.toLocaleLowerCase()}`;
    if (names.has(nameKey)) throw new Error('Design variable names must be unique within a collection.');
    names.add(nameKey);
    const modeIds = new Set(collection.modes.map((mode) => mode.id));
    if (!variable.values[collection.defaultModeId]) throw new Error('A design variable needs a value for the default mode.');
    for (const [modeId, value] of Object.entries(variable.values)) {
      if (!modeIds.has(modeId)) throw new Error('Design variable value references an unknown mode.');
      validateVariableValue(variable, value);
      if (value.kind === 'alias') {
        const target = variables.get(value.variableId);
        if (!target || target.type !== variable.type || target.id === variable.id) throw new Error('Invalid design variable alias.');
      }
    }
  }

  const visit = (variableId: string, path: Set<string>) => {
    if (path.has(variableId)) throw new Error('Design variable aliases cannot form a cycle.');
    const variable = variables.get(variableId);
    if (!variable) return;
    const nextPath = new Set(path).add(variableId);
    for (const value of Object.values(variable.values)) if (value.kind === 'alias') visit(value.variableId, nextPath);
  };
  for (const variableId of variables.keys()) visit(variableId, new Set());

  for (const element of document.elements) {
    for (const [property, variableId] of Object.entries(element.variableBindings) as Array<[DesignBindableProperty, string]>) {
      const variable = variables.get(variableId);
      if (!variable || !compatibleVariableTypes(property).includes(variable.type)) throw new Error('Invalid design variable binding.');
    }
  }
}

function detachVariableAliases(document: DesignDocument, removedIds: Set<string>): void {
  const resolvedValues = new Map(
    [...removedIds].map((variableId) => [variableId, resolveDesignVariableValue(document, variableId)]),
  );
  document.variables = document.variables.map((variable) => ({
    ...variable,
    values: Object.fromEntries(Object.entries(variable.values).map(([modeId, value]) => {
      if (value.kind !== 'alias' || !removedIds.has(value.variableId)) return [modeId, value];
      const resolved = resolvedValues.get(value.variableId);
      if (!resolved) throw new Error('The deleted design variable could not be resolved.');
      return [modeId, structuredClone(resolved)];
    })),
  }));
}

function elementDescendants(document: DesignDocument, rootId: string): DesignElement[] {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of document.elements) {
      if (element.parentId && ids.has(element.parentId) && !ids.has(element.id)) {
        ids.add(element.id);
        changed = true;
      }
    }
  }
  return document.elements.filter((element) => ids.has(element.id));
}

function isElementDescendant(document: DesignDocument, elementId: string, rootId: string): boolean {
  let current = document.elements.find((element) => element.id === elementId);
  while (current) {
    if (current.id === rootId) return true;
    current = current.parentId ? document.elements.find((element) => element.id === current?.parentId) : undefined;
  }
  return false;
}

function componentPropertyValue(component: DesignComponent, root: DesignElement, property: DesignComponentProperty) {
  return root.instanceProperties[property.id] ?? property.defaultValue;
}

function applyComponentProperties(document: DesignDocument, component: DesignComponent, root: DesignElement): void {
  for (const property of component.properties) {
    if (property.type === 'slot') continue;
    const target = document.elements.find((element) =>
      element.instanceRootId === root.id && element.instanceSourceId === property.targetElementId,
    );
    if (!target) continue;
    const value = componentPropertyValue(component, root, property);
    if (property.type === 'text' && typeof value === 'string') target.text = value;
    if (property.type === 'boolean' && typeof value === 'boolean') target.visible = value;
  }
}

function applyInstanceOverrides(root: DesignElement, element: DesignElement): DesignElement {
  if (!element.instanceSourceId) return element;
  const overrides = root.instanceOverrides[element.instanceSourceId];
  return overrides ? { ...element, ...structuredClone(overrides) } : element;
}

function componentDefaultProperties(component: DesignComponent): DesignElement['instanceProperties'] {
  return Object.fromEntries(component.properties.map((property) => [property.id, structuredClone(property.defaultValue)]));
}

function cloneComponentElements(
  document: DesignDocument,
  component: DesignComponent,
  placement: { instanceId: string; pageId: string; parentId: string | null; x: number; y: number; order?: number },
): DesignElement[] {
  const sourceRoot = document.elements.find((element) => element.id === component.rootElementId);
  if (!sourceRoot) throw new Error('Component root layer not found.');
  const sourceElements = elementDescendants(document, sourceRoot.id);
  const ids = new Map(sourceElements.map((element) => [element.id, element.id === sourceRoot.id ? placement.instanceId : uuidv7()]));
  const dx = placement.x - sourceRoot.x;
  const dy = placement.y - sourceRoot.y;
  return sourceElements.map((source) => {
    const isRoot = source.id === sourceRoot.id;
    const clone: DesignElement = {
      ...structuredClone(source),
      id: ids.get(source.id)!,
      pageId: placement.pageId,
      parentId: isRoot ? placement.parentId : ids.get(source.parentId!) ?? placement.instanceId,
      x: source.x + dx,
      y: source.y + dy,
      order: isRoot ? placement.order ?? source.order : source.order,
      name: isRoot ? `${component.name} instance` : source.name,
      componentId: null,
      figmaSource: null,
      instanceOf: isRoot ? component.id : null,
      instanceRootId: placement.instanceId,
      instanceSourceId: source.id,
      instanceProperties: isRoot ? componentDefaultProperties(component) : {},
      instanceOverrides: {},
      slotAssignments: {},
    };
    return clone;
  });
}

function syncComponentInstance(document: DesignDocument, root: DesignElement): void {
  const component = root.instanceOf ? document.components.find((candidate) => candidate.id === root.instanceOf) : null;
  if (!component) return;
  const sourceRoot = document.elements.find((element) => element.id === component.rootElementId);
  if (!sourceRoot) return;
  const sources = elementDescendants(document, sourceRoot.id);
  const desiredSourceIds = new Set(sources.map((source) => source.id));
  const existing = new Map(
    document.elements
      .filter((element) => element.instanceRootId === root.id && element.instanceSourceId)
      .map((element) => [element.instanceSourceId!, element]),
  );
  const ids = new Map(sources.map((source) => [source.id, source.id === sourceRoot.id ? root.id : existing.get(source.id)?.id ?? uuidv7()]));
  const dx = root.x - sourceRoot.x;
  const dy = root.y - sourceRoot.y;
  const synced = sources.map((source) => {
    const isRoot = source.id === sourceRoot.id;
    const previous = isRoot ? root : existing.get(source.id);
    const candidate: DesignElement = {
      ...structuredClone(source),
      id: ids.get(source.id)!,
      pageId: root.pageId,
      parentId: isRoot ? root.parentId : ids.get(source.parentId!) ?? root.id,
      x: isRoot ? root.x : source.x + dx,
      y: isRoot ? root.y : source.y + dy,
      order: isRoot ? root.order : source.order,
      name: isRoot ? root.name : source.name,
      componentId: null,
      figmaSource: isRoot ? root.figmaSource ?? null : null,
      instanceOf: isRoot ? component.id : null,
      instanceRootId: root.id,
      instanceSourceId: source.id,
      instanceProperties: isRoot ? Object.fromEntries(component.properties.map((property) => [
        property.id,
        structuredClone(root.instanceProperties[property.id] ?? property.defaultValue),
      ])) : {},
      instanceOverrides: isRoot ? root.instanceOverrides : {},
      slotAssignments: isRoot ? root.slotAssignments : {},
    };
    return applyInstanceOverrides(root, previous ? { ...candidate, id: previous.id } : candidate);
  });
  document.elements = document.elements.filter((element) =>
    element.instanceRootId !== root.id
    || element.id === root.id
    || !element.instanceSourceId
    || desiredSourceIds.has(element.instanceSourceId)
  );
  const syncedIds = new Set(synced.map((element) => element.id));
  document.elements = document.elements.filter((element) => !syncedIds.has(element.id));
  document.elements.push(...synced);
  const syncedRoot = document.elements.find((element) => element.id === root.id)!;
  applyComponentProperties(document, component, syncedRoot);
}

function syncComponentInstances(document: DesignDocument): void {
  const roots = document.elements.filter((element) => element.instanceOf && element.instanceRootId === element.id);
  for (const root of roots) syncComponentInstance(document, root);
}

function detachComponentInstance(document: DesignDocument, instanceId: string): void {
  const root = document.elements.find((element) => element.id === instanceId && element.instanceRootId === instanceId && element.instanceOf);
  if (!root) throw new Error('Component instance not found.');
  for (const element of document.elements) {
    if (element.instanceRootId !== instanceId) continue;
    element.instanceOf = null;
    element.instanceRootId = null;
    element.instanceSourceId = null;
    element.instanceProperties = {};
    element.instanceOverrides = {};
    element.slotAssignments = {};
  }
}

function validateDesignComponents(document: DesignDocument): void {
  const components = new Map(document.components.map((component) => [component.id, component]));
  if (components.size !== document.components.length) throw new Error('Design component ids must be unique.');
  const keys = new Set<string>();
  const sets = new Map(document.componentSets.map((set) => [set.id, set]));
  if (sets.size !== document.componentSets.length) throw new Error('Design component set ids must be unique.');
  const libraryLinks = new Set(document.libraryLinks.map((link) => link.id));
  if (libraryLinks.size !== document.libraryLinks.length) throw new Error('Design library links must be unique.');
  const figmaLinks = new Set(document.figmaLinks.map((link) => link.id));
  if (figmaLinks.size !== document.figmaLinks.length) throw new Error('Figma design links must be unique.');
  for (const link of document.figmaLinks) {
    const mappedElements = new Set<string>();
    for (const [sourceNodeId, elementId] of Object.entries(link.mappings)) {
      const element = document.elements.find((candidate) => candidate.id === elementId);
      if (!element || element.figmaSource?.linkId !== link.id || element.figmaSource.nodeId !== sourceNodeId) {
        throw new Error('Invalid Figma layer mapping.');
      }
      if (mappedElements.has(elementId)) throw new Error('Figma layer mappings must be unique.');
      mappedElements.add(elementId);
    }
    const mappedSourceIds = new Set(Object.keys(link.mappings));
    if ([...Object.keys(link.baselineHashes), ...Object.keys(link.localHashes), ...Object.keys(link.imageRefs), ...link.pendingPushNodeIds].some((sourceNodeId) => !mappedSourceIds.has(sourceNodeId))) {
      throw new Error('Invalid Figma synchronization state.');
    }
  }
  const validateFigmaReference = (source: { linkId: string } | null | undefined) => {
    if (source && !figmaLinks.has(source.linkId)) throw new Error('Invalid Figma design reference.');
  };
  const validateLibraryReference = (libraryId: string | null, sourceId: string | null) => {
    if (Boolean(libraryId) !== Boolean(sourceId) || (libraryId && !libraryLinks.has(libraryId))) throw new Error('Invalid design library reference.');
  };
  for (const collection of document.variableCollections) { validateLibraryReference(collection.libraryId, collection.librarySourceId); validateFigmaReference(collection.figmaSource); }
  for (const variable of document.variables) { validateLibraryReference(variable.libraryId, variable.librarySourceId); validateFigmaReference(variable.figmaSource); }
  for (const set of document.componentSets) { validateLibraryReference(set.libraryId, set.librarySourceId); validateFigmaReference(set.figmaSource); }
  for (const component of document.components) {
    validateLibraryReference(component.libraryId, component.librarySourceId);
    validateFigmaReference(component.figmaSource);
    if (keys.has(component.key)) throw new Error('Design component keys must be unique.');
    keys.add(component.key);
    const root = document.elements.find((element) => element.id === component.rootElementId);
    if (!root || root.componentId !== component.id || (root.type !== 'frame' && root.type !== 'group')) throw new Error('Invalid design component root.');
    if (component.setId && !sets.has(component.setId)) throw new Error('Design component set not found.');
    const propertyIds = new Set<string>();
    for (const property of component.properties) {
      if (propertyIds.has(property.id) || !isElementDescendant(document, property.targetElementId, root.id)) throw new Error('Invalid component property target.');
      propertyIds.add(property.id);
      const target = document.elements.find((element) => element.id === property.targetElementId)!;
      if (property.type === 'text' && (target.type !== 'text' || typeof property.defaultValue !== 'string')) throw new Error('Invalid text component property.');
      if (property.type === 'boolean' && typeof property.defaultValue !== 'boolean') throw new Error('Invalid boolean component property.');
      if (property.type === 'slot' && target.type !== 'frame' && target.type !== 'group') throw new Error('Invalid component slot.');
    }
  }
  for (const element of document.elements) {
    validateFigmaReference(element.figmaSource);
    if (element.componentId && components.get(element.componentId)?.rootElementId !== element.id) throw new Error('Invalid component layer reference.');
    if (!element.instanceRootId && !element.instanceOf && !element.instanceSourceId) continue;
    if (!element.instanceRootId || !element.instanceSourceId) throw new Error('Invalid component instance.');
    const root = document.elements.find((candidate) => candidate.id === element.instanceRootId);
    if (!root?.instanceOf || root.instanceRootId !== root.id || !components.has(root.instanceOf)) throw new Error('Invalid component instance root.');
    const component = components.get(root.instanceOf)!;
    if (!isElementDescendant(document, element.instanceSourceId, component.rootElementId)) throw new Error('Invalid component instance source.');
    if (element.id === root.id && element.instanceOf !== root.instanceOf) throw new Error('Invalid component instance root reference.');
    if (element.id !== root.id && element.instanceOf) throw new Error('Only the instance root can reference a component.');
  }
}

export function applyDesignOperations(document: DesignDocument, operations: DesignOperation[], now: string): DesignDocument {
  let next: DesignDocument = structuredClone(document);
  for (const operation of operations) {
    if (operation.kind === 'create') {
      const elementId = operation.element.id ?? uuidv7();
      if (next.elements.some((element) => element.id === elementId)) {
        throw new Error(`Design element ${operation.element.id} already exists.`);
      }
      if (!next.pages.some((page) => page.id === operation.element.pageId)) {
        throw new Error('Design page not found.');
      }
      if (operation.element.parentId) {
        const parent = next.elements.find((element) => element.id === operation.element.parentId);
        if (!parent) throw new Error('Parent design element not found.');
        if (parent.pageId !== operation.element.pageId) throw new Error('Parent design element belongs to another page.');
        if (parent.type !== 'frame' && parent.type !== 'group') throw new Error('Only frames and groups can contain design elements.');
      }
      if (operation.element.assetId && !next.assets.some((asset) => asset.id === operation.element.assetId)) {
        throw new Error('Design asset not found.');
      }
      if (operation.element.maskId && !next.elements.some((element) => element.id === operation.element.maskId)) {
        throw new Error('Design mask not found.');
      }
      const siblingOrders = next.elements
        .filter((element) => element.pageId === operation.element.pageId && element.parentId === operation.element.parentId)
        .map((element) => element.order);
      next.elements.push({ ...operation.element, id: elementId, order: operation.element.order ?? (Math.max(-1, ...siblingOrders) + 1) });
      continue;
    }
    if (operation.kind === 'update') {
      const index = next.elements.findIndex((element) => element.id === operation.elementId);
      if (index < 0) throw new Error('Design element not found.');
      const protectedFields = ['componentId', 'instanceOf', 'instanceRootId', 'instanceSourceId', 'instanceProperties', 'instanceOverrides', 'slotAssignments'] as const;
      if (protectedFields.some((field) => field in operation.changes)) throw new Error('Component metadata requires a component operation.');
      if (next.elements[index].locked) {
        const onlyLockChange = Object.keys(operation.changes).every((key) => key === 'locked');
        if (!onlyLockChange) throw new Error('Design element is locked.');
      }
      const target = next.elements[index];
      if (target.instanceRootId && target.instanceSourceId) {
        const root = next.elements.find((element) => element.id === target.instanceRootId);
        if (!root) throw new Error('Component instance root not found.');
        const changes = structuredClone(operation.changes) as Record<string, unknown>;
        if (target.id === root.id) {
          delete changes.x;
          delete changes.y;
          delete changes.parentId;
          delete changes.order;
        }
        const allowed = new Set([
          'name', 'x', 'y', 'width', 'height', 'rotation', 'opacity', 'visible',
          'fill', 'stroke', 'strokeWidth', 'fills', 'strokes', 'effects',
          'blendMode', 'cornerRadius', 'text', 'fontSize', 'fontWeight',
          'textAlign', 'assetId', 'imageFit',
        ]);
        const overrides = Object.fromEntries(Object.entries(changes).filter(([key]) => allowed.has(key)));
        if (Object.keys(overrides).length) {
          root.instanceOverrides[target.instanceSourceId] = {
            ...(root.instanceOverrides[target.instanceSourceId] ?? {}),
            ...overrides,
          } as DesignElement['instanceOverrides'][string];
        }
      }
      next.elements[index] = { ...next.elements[index], ...operation.changes };
      continue;
    }
    if (operation.kind === 'delete') {
      const target = next.elements.find((element) => element.id === operation.elementId);
      if (!target) throw new Error('Design element not found.');
      if (target.locked) throw new Error('Design element is locked.');
      if (target.instanceRootId && target.instanceRootId !== target.id) throw new Error('Detach the component instance before deleting one of its layers.');
      const descendants = new Set<string>([operation.elementId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const element of next.elements) {
          if (element.parentId && descendants.has(element.parentId) && !descendants.has(element.id)) {
            descendants.add(element.id);
            changed = true;
          }
        }
      }
      next.elements = next.elements.filter((element) => !descendants.has(element.id));
      next.elements = next.elements.map((element) => element.maskId && descendants.has(element.maskId)
        ? { ...element, maskId: null }
        : element);
      continue;
    }
    if (operation.kind === 'reorder') {
      const target = next.elements.find((element) => element.id === operation.elementId);
      if (!target) throw new Error('Design element not found.');
      if (target.locked) throw new Error('Design element is locked.');
      if (target.instanceRootId && target.instanceRootId !== target.id) throw new Error('Detach the component instance before changing its hierarchy.');
      target.order = operation.order;
      continue;
    }
    if (operation.kind === 'reparent') {
      const target = next.elements.find((element) => element.id === operation.elementId);
      if (!target) throw new Error('Design element not found.');
      if (target.locked) throw new Error('Design element is locked.');
      if (operation.parentId) {
        const parent = next.elements.find((element) => element.id === operation.parentId);
        if (!parent || (parent.type !== 'frame' && parent.type !== 'group') || parent.pageId !== target.pageId) throw new Error('Invalid design parent.');
        let ancestor: DesignElement | undefined = parent;
        while (ancestor) {
          if (ancestor.id === target.id) throw new Error('Design elements cannot contain themselves.');
          ancestor = ancestor.parentId ? next.elements.find((element) => element.id === ancestor?.parentId) : undefined;
        }
      }
      target.parentId = operation.parentId;
      if (operation.order !== undefined) target.order = operation.order;
      continue;
    }
    if (operation.kind === 'add-asset') {
      if (next.assets.some((asset) => asset.id === operation.asset.id || asset.path === operation.asset.path)) {
        throw new Error('Design asset already exists.');
      }
      next.assets.push(operation.asset);
      continue;
    }
    if (operation.kind === 'delete-asset') {
      if (next.elements.some((element) => element.assetId === operation.assetId)) {
        throw new Error('Design asset is still used by a layer.');
      }
      if (!next.assets.some((asset) => asset.id === operation.assetId)) throw new Error('Design asset not found.');
      next.assets = next.assets.filter((asset) => asset.id !== operation.assetId);
      continue;
    }
    if (operation.kind === 'add-guide') {
      if (next.guides.some((guide) => guide.id === operation.guide.id)) throw new Error('Design guide already exists.');
      next.guides.push(operation.guide);
      continue;
    }
    if (operation.kind === 'update-guide') {
      const guide = next.guides.find((item) => item.id === operation.guideId);
      if (!guide) throw new Error('Design guide not found.');
      guide.position = operation.position;
      continue;
    }
    if (operation.kind === 'delete-guide') {
      if (!next.guides.some((guide) => guide.id === operation.guideId)) throw new Error('Design guide not found.');
      next.guides = next.guides.filter((guide) => guide.id !== operation.guideId);
      continue;
    }
    if (operation.kind === 'add-variable-collection') {
      if (next.variableCollections.some((collection) => collection.id === operation.collection.id)) throw new Error('Design variable collection already exists.');
      next.variableCollections.push(operation.collection);
      next.activeVariableModes[operation.collection.id] = operation.collection.defaultModeId;
      continue;
    }
    if (operation.kind === 'update-variable-collection') {
      const collection = next.variableCollections.find((candidate) => candidate.id === operation.collectionId);
      if (!collection) throw new Error('Design variable collection not found.');
      Object.assign(collection, operation.changes);
      continue;
    }
    if (operation.kind === 'delete-variable-collection') {
      if (!next.variableCollections.some((collection) => collection.id === operation.collectionId)) throw new Error('Design variable collection not found.');
      const removedIds = new Set(next.variables.filter((variable) => variable.collectionId === operation.collectionId).map((variable) => variable.id));
      detachVariableAliases(next, removedIds);
      next.variableCollections = next.variableCollections.filter((collection) => collection.id !== operation.collectionId);
      next.variables = next.variables.filter((variable) => !removedIds.has(variable.id));
      delete next.activeVariableModes[operation.collectionId];
      next.elements = next.elements.map((element) => ({
        ...element,
        variableBindings: Object.fromEntries(Object.entries(element.variableBindings).filter(([, variableId]) => !removedIds.has(variableId))),
      }));
      continue;
    }
    if (operation.kind === 'add-variable') {
      if (next.variables.some((variable) => variable.id === operation.variable.id)) throw new Error('Design variable already exists.');
      next.variables.push(operation.variable);
      continue;
    }
    if (operation.kind === 'update-variable') {
      const variable = next.variables.find((candidate) => candidate.id === operation.variableId);
      if (!variable) throw new Error('Design variable not found.');
      Object.assign(variable, operation.changes);
      continue;
    }
    if (operation.kind === 'delete-variable') {
      if (!next.variables.some((variable) => variable.id === operation.variableId)) throw new Error('Design variable not found.');
      detachVariableAliases(next, new Set([operation.variableId]));
      next.variables = next.variables.filter((variable) => variable.id !== operation.variableId);
      next.elements = next.elements.map((element) => ({
        ...element,
        variableBindings: Object.fromEntries(Object.entries(element.variableBindings).filter(([, variableId]) => variableId !== operation.variableId)),
      }));
      continue;
    }
    if (operation.kind === 'set-active-variable-mode') {
      const collection = next.variableCollections.find((candidate) => candidate.id === operation.collectionId);
      if (!collection || !collection.modes.some((mode) => mode.id === operation.modeId)) throw new Error('Design variable mode not found.');
      next.activeVariableModes[operation.collectionId] = operation.modeId;
      continue;
    }
    if (operation.kind === 'bind-variable') {
      const element = next.elements.find((candidate) => candidate.id === operation.elementId);
      if (!element) throw new Error('Design element not found.');
      if (element.locked) throw new Error('Design element is locked.');
      if (operation.variableId) element.variableBindings[operation.property] = operation.variableId;
      else delete element.variableBindings[operation.property];
      continue;
    }
    if (operation.kind === 'add-component') {
      if (next.components.some((component) => component.id === operation.component.id)) throw new Error('Design component already exists.');
      const root = next.elements.find((element) => element.id === operation.component.rootElementId);
      if (!root || (root.type !== 'frame' && root.type !== 'group') || root.componentId || root.instanceRootId) throw new Error('Select an independent frame or group for the component.');
      root.componentId = operation.component.id;
      next.components.push(operation.component);
      continue;
    }
    if (operation.kind === 'update-component') {
      const component = next.components.find((candidate) => candidate.id === operation.componentId);
      if (!component) throw new Error('Design component not found.');
      Object.assign(component, operation.changes);
      continue;
    }
    if (operation.kind === 'delete-component') {
      const component = next.components.find((candidate) => candidate.id === operation.componentId);
      if (!component) throw new Error('Design component not found.');
      for (const instance of next.elements.filter((element) => element.instanceOf === component.id && element.instanceRootId === element.id)) {
        detachComponentInstance(next, instance.id);
      }
      const root = next.elements.find((element) => element.id === component.rootElementId);
      if (root) root.componentId = null;
      next.components = next.components.filter((candidate) => candidate.id !== component.id);
      continue;
    }
    if (operation.kind === 'add-component-set') {
      if (next.componentSets.some((set) => set.id === operation.componentSet.id)) throw new Error('Design component set already exists.');
      next.componentSets.push(operation.componentSet);
      continue;
    }
    if (operation.kind === 'update-component-set') {
      const set = next.componentSets.find((candidate) => candidate.id === operation.componentSetId);
      if (!set) throw new Error('Design component set not found.');
      Object.assign(set, operation.changes);
      continue;
    }
    if (operation.kind === 'delete-component-set') {
      if (!next.componentSets.some((set) => set.id === operation.componentSetId)) throw new Error('Design component set not found.');
      next.componentSets = next.componentSets.filter((set) => set.id !== operation.componentSetId);
      next.components = next.components.map((component) => component.setId === operation.componentSetId ? { ...component, setId: null, variantValues: {} } : component);
      continue;
    }
    if (operation.kind === 'add-library-link') {
      if (next.libraryLinks.some((link) => link.id === operation.link.id)) throw new Error('Design library is already linked.');
      next.libraryLinks.push(operation.link);
      continue;
    }
    if (operation.kind === 'update-library-link') {
      const link = next.libraryLinks.find((candidate) => candidate.id === operation.libraryId);
      if (!link) throw new Error('Design library link not found.');
      Object.assign(link, operation.changes);
      continue;
    }
    if (operation.kind === 'delete-library-link') {
      if (!next.libraryLinks.some((link) => link.id === operation.libraryId)) throw new Error('Design library link not found.');
      next.libraryLinks = next.libraryLinks.filter((link) => link.id !== operation.libraryId);
      continue;
    }
    if (operation.kind === 'add-figma-link') {
      if (next.figmaLinks.some((link) => link.id === operation.link.id)) throw new Error('Figma file is already linked.');
      next.figmaLinks.push(operation.link);
      continue;
    }
    if (operation.kind === 'update-figma-link') {
      const link = next.figmaLinks.find((candidate) => candidate.id === operation.linkId);
      if (!link) throw new Error('Figma design link not found.');
      Object.assign(link, operation.changes);
      continue;
    }
    if (operation.kind === 'delete-figma-link') {
      if (!next.figmaLinks.some((link) => link.id === operation.linkId)) throw new Error('Figma design link not found.');
      next.figmaLinks = next.figmaLinks.filter((link) => link.id !== operation.linkId);
      for (const element of next.elements) if (element.figmaSource?.linkId === operation.linkId) element.figmaSource = null;
      for (const collection of next.variableCollections) if (collection.figmaSource?.linkId === operation.linkId) collection.figmaSource = null;
      for (const variable of next.variables) if (variable.figmaSource?.linkId === operation.linkId) variable.figmaSource = null;
      for (const set of next.componentSets) if (set.figmaSource?.linkId === operation.linkId) set.figmaSource = null;
      for (const component of next.components) if (component.figmaSource?.linkId === operation.linkId) component.figmaSource = null;
      continue;
    }
    if (operation.kind === 'add-code-artifact') {
      if (next.codeArtifacts.some((artifact) => artifact.id === operation.artifact.id || artifact.path === operation.artifact.path)) {
        throw new Error('A generated code artifact already exists for this path.');
      }
      next.codeArtifacts.push(operation.artifact);
      continue;
    }
    if (operation.kind === 'update-code-artifact') {
      const artifact = next.codeArtifacts.find((candidate) => candidate.id === operation.artifactId);
      if (!artifact) throw new Error('Generated code artifact not found.');
      if (operation.changes.path && next.codeArtifacts.some((candidate) => candidate.id !== artifact.id && candidate.path === operation.changes.path)) {
        throw new Error('A generated code artifact already exists for this path.');
      }
      Object.assign(artifact, operation.changes);
      continue;
    }
    if (operation.kind === 'delete-code-artifact') {
      if (!next.codeArtifacts.some((artifact) => artifact.id === operation.artifactId)) throw new Error('Generated code artifact not found.');
      next.codeArtifacts = next.codeArtifacts.filter((artifact) => artifact.id !== operation.artifactId);
      continue;
    }
    if (operation.kind === 'create-component-instance') {
      if (next.elements.some((element) => element.id === operation.instanceId)) throw new Error('Component instance already exists.');
      const component = next.components.find((candidate) => candidate.id === operation.componentId);
      if (!component) throw new Error('Design component not found.');
      if (!next.pages.some((page) => page.id === operation.pageId)) throw new Error('Design page not found.');
      if (operation.parentId) {
        const parent = next.elements.find((element) => element.id === operation.parentId);
        if (!parent || parent.pageId !== operation.pageId || (parent.type !== 'frame' && parent.type !== 'group')) throw new Error('Invalid component instance parent.');
      }
      next.elements.push(...cloneComponentElements(next, component, operation));
      continue;
    }
    if (operation.kind === 'swap-component-instance') {
      const root = next.elements.find((element) => element.id === operation.instanceId && element.instanceRootId === element.id && element.instanceOf);
      const component = next.components.find((candidate) => candidate.id === operation.componentId);
      if (!root || !component) throw new Error('Component instance not found.');
      if (Object.values(root.slotAssignments).some((elementIds) => elementIds.length)) throw new Error('Remove slot content before swapping this instance.');
      const previousComponent = next.components.find((candidate) => candidate.id === root.instanceOf);
      const previousValues = new Map((previousComponent?.properties ?? []).map((property) => [property.name, root.instanceProperties[property.id]]));
      const properties = Object.fromEntries(component.properties.map((property) => [property.id, previousValues.get(property.name) ?? structuredClone(property.defaultValue)]));
      const placement = { instanceId: root.id, pageId: root.pageId, parentId: root.parentId, x: root.x, y: root.y, order: root.order };
      next.elements = next.elements.filter((element) => element.instanceRootId !== root.id);
      const clones = cloneComponentElements(next, component, placement);
      clones[0].name = root.name;
      clones[0].instanceProperties = properties;
      next.elements.push(...clones);
      continue;
    }
    if (operation.kind === 'set-instance-property') {
      const root = next.elements.find((element) => element.id === operation.instanceId && element.instanceRootId === element.id && element.instanceOf);
      const component = root?.instanceOf ? next.components.find((candidate) => candidate.id === root.instanceOf) : null;
      const property = component?.properties.find((candidate) => candidate.id === operation.propertyId);
      if (!root || !component || !property || property.type === 'slot') throw new Error('Component property not found.');
      if (property.type === 'text' && typeof operation.value !== 'string') throw new Error('Text component properties require text values.');
      if (property.type === 'boolean' && typeof operation.value !== 'boolean') throw new Error('Boolean component properties require boolean values.');
      root.instanceProperties[property.id] = operation.value;
      continue;
    }
    if (operation.kind === 'assign-instance-slot') {
      const root = next.elements.find((element) => element.id === operation.instanceId && element.instanceRootId === element.id && element.instanceOf);
      const component = root?.instanceOf ? next.components.find((candidate) => candidate.id === root.instanceOf) : null;
      const property = component?.properties.find((candidate) => candidate.id === operation.propertyId && candidate.type === 'slot');
      const target = property ? next.elements.find((element) => element.instanceRootId === root?.id && element.instanceSourceId === property.targetElementId) : null;
      if (!root || !component || !property || !target) throw new Error('Component slot not found.');
      const previousIds = new Set(root.slotAssignments[property.id] ?? []);
      for (const element of next.elements) {
        if (previousIds.has(element.id) && !operation.elementIds.includes(element.id)) element.parentId = root.parentId;
      }
      for (const elementId of operation.elementIds) {
        const element = next.elements.find((candidate) => candidate.id === elementId);
        if (!element || element.pageId !== root.pageId || element.instanceRootId || isElementDescendant(next, element.id, root.id)) throw new Error('Invalid component slot content.');
        element.parentId = target.id;
      }
      root.slotAssignments[property.id] = [...operation.elementIds];
      continue;
    }
    if (operation.kind === 'detach-component-instance') {
      detachComponentInstance(next, operation.instanceId);
      continue;
    }
    if (operation.kind === 'set-active-page') {
      if (!next.pages.some((page) => page.id === operation.pageId)) throw new Error('Design page not found.');
      next.activePageId = operation.pageId;
      continue;
    }
    if (operation.kind === 'rename-document') next.name = operation.name;
  }
  const elementIds = new Set(next.elements.map((element) => element.id));
  const assetIds = new Set(next.assets.map((asset) => asset.id));
  for (const element of next.elements) {
    if (element.assetId && !assetIds.has(element.assetId)) throw new Error('Design asset not found.');
    if (element.maskId && (!elementIds.has(element.maskId) || element.maskId === element.id)) throw new Error('Invalid design mask.');
  }
  syncComponentInstances(next);
  validateDesignVariables(next);
  validateDesignComponents(next);
  next.elements = sortElements(next.elements);
  next.updatedAt = now;
  return designDocumentSchema.parse(next);
}

export class DesignDocumentService {
  private async serialized<T>(workspaceId: string, nodeId: string, operation: () => Promise<T>): Promise<T> {
    const key = `${workspaceId}:${nodeId}`;
    const queues = mutationQueues();
    const preceding = queues.get(key) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    const tail = preceding.catch(() => undefined).then(() => gate);
    queues.set(key, tail);
    await preceding.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (queues.get(key) === tail) queues.delete(key);
    }
  }

  private async context(workspaceId: string, nodeId: string) {
    const [workspace, node] = await Promise.all([
      workspaceRepository.getWorkspace(workspaceId),
      workspaceRepository.getNode(nodeId),
    ]);
    if (!workspace || !node || node.workspaceId !== workspaceId || node.type !== 'design') {
      throw new Error('Design document not found.');
    }
    const root = resolve(workspace.workingDir);
    const directory = resolve(root, '.orkestrai', 'designs');
    if (directory !== root && !directory.startsWith(root + sep)) throw new Error('Invalid design directory.');
    return {
      node,
      root,
      directory,
      path: join(directory, `${nodeId}.orkestrai-design.json`),
      historyPath: join(directory, `${nodeId}.history.jsonl`),
      thumbnailPath: join(directory, 'thumbnails', `${nodeId}.png`),
      thumbnailRevisionPath: join(directory, 'thumbnails', `${nodeId}.revision`),
    };
  }

  private createDefault(workspaceId: string, nodeId: string, name: string): DesignDocument {
    const now = new Date().toISOString();
    const pageId = uuidv7();
    return {
      schemaVersion: 1,
      id: uuidv7(),
      nodeId,
      workspaceId,
      name: name || 'Untitled design',
      revision: 0,
      activePageId: pageId,
      pages: [{ id: pageId, name: 'Page 1', width: 1440, height: 1024, background: '#f5f5f3', order: 0 }],
      elements: [],
      assets: [],
      guides: [],
      variableCollections: [],
      variables: [],
      activeVariableModes: {},
      components: [],
      componentSets: [],
      libraryLinks: [],
      figmaLinks: [],
      codeArtifacts: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private async writeAtomic(path: string, document: DesignDocument): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
  }

  private async getUnlocked(workspaceId: string, nodeId: string): Promise<DesignDocument> {
    const context = await this.context(workspaceId, nodeId);
    try {
      return designDocumentSchema.parse(JSON.parse(await readFile(context.path, 'utf8')));
    } catch (error) {
      const candidate = error as NodeJS.ErrnoException;
      if (candidate.code !== 'ENOENT') throw error;
      const document = designDocumentSchema.parse(this.createDefault(workspaceId, nodeId, context.node.title ?? 'Untitled design'));
      await this.writeAtomic(context.path, document);
      return document;
    }
  }

  async get(workspaceId: string, nodeId: string): Promise<DesignDocument> {
    return this.serialized(workspaceId, nodeId, () => this.getUnlocked(workspaceId, nodeId));
  }

  async apply(dto: ApplyDesignOperationsDto): Promise<DesignDocument> {
    return this.serialized(dto.workspaceId, dto.nodeId, async () => {
      const context = await this.context(dto.workspaceId, dto.nodeId);
      const current = await this.getUnlocked(dto.workspaceId, dto.nodeId);
      if (current.revision !== dto.baseRevision) throw new DesignRevisionConflictError(current);
      const now = new Date().toISOString();
      const next = applyDesignOperations(current, dto.operations, now);
      const deletedAssetPaths = dto.operations
        .filter((operation) => operation.kind === 'delete-asset')
        .map((operation) => current.assets.find((asset) => asset.id === operation.assetId)?.path)
        .filter((path): path is string => Boolean(path));
      next.revision = current.revision + 1;
      const validated = designDocumentSchema.parse(next);
      await this.writeAtomic(context.path, validated);
      await appendFile(context.historyPath, `${JSON.stringify({
        revision: validated.revision,
        baseRevision: dto.baseRevision,
        actor: dto.actor,
        summary: dto.summary,
        operations: dto.operations,
        createdAt: now,
      })}\n`, 'utf8').catch((error) => {
        console.error('[design] Failed to append document history.', error);
      });
      broadcastDesignChanged(dto.workspaceId, dto.nodeId, validated.revision);
      await Promise.all(deletedAssetPaths.map(async (path) => {
        const absolute = resolve(context.root, path);
        if (absolute.startsWith(context.root + sep)) await rm(absolute, { force: true });
      }));
      return validated;
    });
  }

  async importAsset(
    workspaceId: string,
    nodeId: string,
    baseRevision: number,
    file: File,
    dimensions: { width: number | null; height: number | null },
  ): Promise<DesignDocument> {
    return this.serialized(workspaceId, nodeId, async () => {
      if (!file || file.size <= 0) throw new Error('The design asset is empty.');
      if (file.size > 20 * 1024 * 1024) throw new Error('The design asset exceeds the 20 MB limit.');
      const context = await this.context(workspaceId, nodeId);
      const current = await this.getUnlocked(workspaceId, nodeId);
      if (current.revision !== baseRevision) throw new DesignRevisionConflictError(current);
      const mimeType = assetMimeType(file.name, file.type);
      const id = uuidv7();
      const relativePath = `.orkestrai/designs/assets/${nodeId}/${id}-${safeAssetFilename(file.name)}`;
      const absolutePath = resolve(context.root, relativePath);
      if (!absolutePath.startsWith(context.root + sep)) throw new Error('Invalid design asset path.');
      const now = new Date().toISOString();
      const asset: DesignAsset = {
        id,
        name: file.name.slice(0, 180),
        path: relativePath,
        mimeType,
        size: file.size,
        width: dimensions.width,
        height: dimensions.height,
        createdAt: now,
      };
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, new Uint8Array(await file.arrayBuffer()));
      try {
        const next = applyDesignOperations(current, [{ kind: 'add-asset', asset }], now);
        next.revision = current.revision + 1;
        const validated = designDocumentSchema.parse(next);
        await this.writeAtomic(context.path, validated);
        await appendFile(context.historyPath, `${JSON.stringify({
          revision: validated.revision,
          baseRevision,
          actor: { kind: 'user', id: null, name: null, taskId: null },
          summary: `Import design asset ${asset.name}`,
          operations: [{ kind: 'add-asset', asset }],
          createdAt: now,
        })}\n`, 'utf8');
        broadcastDesignChanged(workspaceId, nodeId, validated.revision);
        return validated;
      } catch (error) {
        await rm(absolutePath, { force: true });
        throw error;
      }
    });
  }

  async readAsset(workspaceId: string, nodeId: string, assetId: string): Promise<{ bytes: Uint8Array; mimeType: DesignAsset['mimeType']; name: string }> {
    const document = await this.get(workspaceId, nodeId);
    const asset = document.assets.find((candidate) => candidate.id === assetId);
    if (!asset) throw new Error('Design asset not found.');
    const context = await this.context(workspaceId, nodeId);
    const absolutePath = resolve(context.root, asset.path);
    if (!absolutePath.startsWith(context.root + sep)) throw new Error('Invalid design asset path.');
    return { bytes: await readFile(absolutePath), mimeType: asset.mimeType, name: asset.name };
  }

  async renameDocument(workspaceId: string, nodeId: string, name: string): Promise<DesignDocument> {
    return this.serialized(workspaceId, nodeId, async () => {
      const context = await this.context(workspaceId, nodeId);
      const current = await this.getUnlocked(workspaceId, nodeId);
      const normalizedName = name.trim();
      if (!normalizedName || current.name === normalizedName) return current;
      const now = new Date().toISOString();
      const next = applyDesignOperations(current, [{ kind: 'rename-document', name: normalizedName }], now);
      next.revision = current.revision + 1;
      const validated = designDocumentSchema.parse(next);
      await this.writeAtomic(context.path, validated);
      await appendFile(context.historyPath, `${JSON.stringify({
        revision: validated.revision,
        baseRevision: current.revision,
        actor: { kind: 'system', id: null, name: 'Orkestrai', taskId: null },
        summary: `Rename design to ${normalizedName}`,
        operations: [{ kind: 'rename-document', name: normalizedName }],
        createdAt: now,
      })}\n`, 'utf8').catch((error) => {
        console.error('[design] Failed to append document history.', error);
      });
      broadcastDesignChanged(workspaceId, nodeId, validated.revision);
      return validated;
    });
  }

  async getThumbnail(workspaceId: string, nodeId: string): Promise<{ data: Buffer; revision: number } | null> {
    const context = await this.context(workspaceId, nodeId);
    try {
      const [data, revisionText, document] = await Promise.all([
        readFile(context.thumbnailPath),
        readFile(context.thumbnailRevisionPath, 'utf8'),
        this.get(workspaceId, nodeId),
      ]);
      const revision = Number(revisionText);
      if (!Number.isInteger(revision) || revision !== document.revision) return null;
      return { data, revision };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async uploadThumbnail(workspaceId: string, nodeId: string, revision: number, file: File): Promise<void> {
    await this.serialized(workspaceId, nodeId, async () => {
      if (file.type !== 'image/png' || file.size <= 0 || file.size > 2 * 1024 * 1024) {
        throw new Error('Invalid design thumbnail.');
      }
      const context = await this.context(workspaceId, nodeId);
      const current = await this.getUnlocked(workspaceId, nodeId);
      if (current.revision !== revision) throw new DesignRevisionConflictError(current);
      await mkdir(dirname(context.thumbnailPath), { recursive: true });
      const temporary = `${context.thumbnailPath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, new Uint8Array(await file.arrayBuffer()));
      await rename(temporary, context.thumbnailPath);
      const revisionTemporary = `${context.thumbnailRevisionPath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(revisionTemporary, String(revision), 'utf8');
      await rename(revisionTemporary, context.thumbnailRevisionPath);
    });
  }

  async remove(workspaceId: string, nodeId: string): Promise<void> {
    await this.serialized(workspaceId, nodeId, async () => {
      const context = await this.context(workspaceId, nodeId);
      await Promise.all([
        rm(context.path, { force: true }),
        rm(context.historyPath, { force: true }),
        rm(join(context.directory, 'assets', nodeId), { recursive: true, force: true }),
        rm(context.thumbnailPath, { force: true }),
        rm(context.thumbnailRevisionPath, { force: true }),
      ]);
    });
  }
}

export const designDocumentService = new DesignDocumentService();
