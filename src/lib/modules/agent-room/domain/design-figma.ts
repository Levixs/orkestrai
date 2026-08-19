import { createHash } from 'node:crypto';
import type {
  DesignComponent,
  DesignComponentProperty,
  DesignComponentSet,
  DesignEffect,
  DesignElement,
  DesignFigmaSource,
  DesignPaint,
  DesignVariable,
  DesignVariableCollection,
  DesignVariableType,
  DesignVariableValue,
} from '../contracts/schemas/designSchemas.js';
import type { FigmaApiNode, FigmaFilePayload, FigmaNodesPayload } from '../infrastructure/figma/FigmaApiClient.js';
import { parseSvgPathData } from './design-svg-import.js';

export type ParsedFigmaUrl = { fileKey: string; nodeId: string | null; canonicalUrl: string };

export type FigmaInspectableNode = {
  id: string;
  name: string;
  type: string;
  pageId: string;
  pageName: string;
  width: number | null;
  height: number | null;
  children: number;
};

export type FigmaInspection = {
  fileKey: string;
  fileName: string;
  version: string | null;
  lastModified: string | null;
  requestedNodeId: string | null;
  nodes: FigmaInspectableNode[];
  components: number;
  componentSets: number;
  styles: number;
};

export type FigmaConversion = {
  elements: DesignElement[];
  components: DesignComponent[];
  componentSets: DesignComponentSet[];
  mappings: Record<string, string>;
  baselineHashes: Record<string, string>;
  imageRefs: string[];
  imageRefsByNode: Record<string, string>;
  warnings: string[];
  originX: number;
  originY: number;
};

type FigmaConversionOptions = {
  linkId: string;
  fileKey: string;
  pageId: string;
  sourceNodes: FigmaApiNode[];
  components?: Record<string, Record<string, unknown>>;
  componentSets?: Record<string, Record<string, unknown>>;
  imageAssets?: Record<string, string>;
  makeId: () => string;
  now: string;
  originX?: number;
  originY?: number;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !['id', 'parent', 'pluginData', 'sharedPluginData'].includes(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonical(nested)]));
}

export function figmaNodeHash(node: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(node))).digest('hex');
}

export function figmaLocalElementHash(element: DesignElement): string {
  const {
    id: _id,
    pageId: _pageId,
    parentId: _parentId,
    order: _order,
    figmaSource: _figmaSource,
    componentId: _componentId,
    instanceOf: _instanceOf,
    instanceRootId: _instanceRootId,
    instanceSourceId: _instanceSourceId,
    instanceProperties: _instanceProperties,
    instanceOverrides: _instanceOverrides,
    slotAssignments: _slotAssignments,
    ...visual
  } = element;
  return figmaNodeHash(visual);
}

export function normalizeFigmaNodeId(value: string): string {
  return value.trim().replace(/[;-]/g, ':');
}

export function parseFigmaUrl(value: string): ParsedFigmaUrl {
  const url = new URL(value.trim());
  const host = url.hostname.toLowerCase();
  if (host !== 'figma.com' && host !== 'www.figma.com') throw new Error('Use a figma.com file URL.');
  const parts = url.pathname.split('/').filter(Boolean);
  if (!['design', 'file', 'proto'].includes(parts[0] ?? '') || !/^[A-Za-z0-9_-]{6,240}$/.test(parts[1] ?? '')) {
    throw new Error('Figma file key was not found in the URL.');
  }
  const node = url.searchParams.get('node-id');
  const nodeId = node ? normalizeFigmaNodeId(node) : null;
  if (nodeId && !/^\d+(?::\d+)+$/.test(nodeId)) throw new Error('Figma node id is invalid.');
  const canonicalUrl = `https://www.figma.com/design/${parts[1]}/${encodeURIComponent(parts[2] || 'Orkestrai')}${nodeId ? `?node-id=${encodeURIComponent(nodeId.replace(/:/g, '-'))}` : ''}`;
  return { fileKey: parts[1], nodeId, canonicalUrl };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function box(node: FigmaApiNode): { x: number; y: number; width: number; height: number } | null {
  const candidate = object(node.absoluteBoundingBox ?? node.absoluteRenderBounds);
  const width = number(candidate.width, 0);
  const height = number(candidate.height, 0);
  return width > 0 && height > 0
    ? { x: number(candidate.x), y: number(candidate.y), width, height }
    : null;
}

export function inspectFigmaFile(parsed: ParsedFigmaUrl, payload: FigmaFilePayload): FigmaInspection {
  const nodes: FigmaInspectableNode[] = [];
  for (const page of payload.document.children ?? []) {
    nodes.push({
      id: page.id,
      name: page.name,
      type: 'CANVAS',
      pageId: page.id,
      pageName: page.name,
      width: null,
      height: null,
      children: page.children?.length ?? 0,
    });
    for (const node of page.children ?? []) {
      const bounds = box(node);
      nodes.push({
        id: node.id,
        name: node.name,
        type: node.type,
        pageId: page.id,
        pageName: page.name,
        width: bounds?.width ?? null,
        height: bounds?.height ?? null,
        children: node.children?.length ?? 0,
      });
    }
  }
  return {
    fileKey: parsed.fileKey,
    fileName: payload.name,
    version: payload.version ?? null,
    lastModified: payload.lastModified ?? null,
    requestedNodeId: parsed.nodeId,
    nodes,
    components: Object.keys(payload.components ?? {}).length,
    componentSets: Object.keys(payload.componentSets ?? {}).length,
    styles: Object.keys(payload.styles ?? {}).length,
  };
}

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value * 255))).toString(16).padStart(2, '0');
}

function color(value: unknown, opacity = 1): string {
  const rgba = object(value);
  const alpha = number(rgba.a, 1) * opacity;
  const result = `#${hexByte(number(rgba.r))}${hexByte(number(rgba.g))}${hexByte(number(rgba.b))}`;
  return alpha < 0.999 ? `${result}${hexByte(alpha)}` : result;
}

function paints(value: unknown): DesignPaint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): DesignPaint[] => {
    const paint = object(candidate);
    if (paint.visible === false) return [];
    const opacity = Math.max(0, Math.min(1, number(paint.opacity, 1)));
    if (paint.type === 'SOLID') return [{ type: 'solid', color: color(paint.color), opacity, visible: true }];
    if (paint.type === 'GRADIENT_LINEAR' || paint.type === 'GRADIENT_RADIAL') {
      const stops = Array.isArray(paint.gradientStops) ? paint.gradientStops.map((stopValue) => {
        const stop = object(stopValue);
        return { offset: Math.max(0, Math.min(1, number(stop.position))), color: color(stop.color), opacity: number(object(stop.color).a, 1) };
      }) : [];
      if (stops.length < 2) return [];
      const handles = Array.isArray(paint.gradientHandlePositions) ? paint.gradientHandlePositions.map(object) : [];
      if (paint.type === 'GRADIENT_RADIAL') {
        return [{ type: 'radial-gradient', centerX: number(handles[0]?.x, 0.5), centerY: number(handles[0]?.y, 0.5), radius: Math.max(0.01, Math.hypot(number(handles[1]?.x) - number(handles[0]?.x), number(handles[1]?.y) - number(handles[0]?.y))), stops, opacity, visible: true }];
      }
      const angle = Math.atan2(number(handles[1]?.y) - number(handles[0]?.y), number(handles[1]?.x) - number(handles[0]?.x)) * 180 / Math.PI;
      return [{ type: 'linear-gradient', angle: Number.isFinite(angle) ? angle : 0, stops, opacity, visible: true }];
    }
    return [];
  });
}

function effects(value: unknown): DesignEffect[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): DesignEffect[] => {
    const effect = object(candidate);
    if (effect.visible === false) return [];
    if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
      return [{
        type: effect.type === 'DROP_SHADOW' ? 'drop-shadow' : 'inner-shadow',
        color: color(effect.color),
        x: number(object(effect.offset).x),
        y: number(object(effect.offset).y, 4),
        blur: Math.max(0, number(effect.radius, 12)),
        spread: number(effect.spread),
        visible: true,
      }];
    }
    if (effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR') {
      return [{ type: effect.type === 'LAYER_BLUR' ? 'layer-blur' : 'background-blur', blur: Math.max(0, number(effect.radius, 8)), visible: true }];
    }
    return [];
  });
}

function nodeType(node: FigmaApiNode, hasImage: boolean): DesignElement['type'] {
  if (hasImage) return 'image';
  if (node.type === 'TEXT') return 'text';
  if (node.type === 'ELLIPSE') return 'ellipse';
  if (['VECTOR', 'BOOLEAN_OPERATION', 'LINE', 'POLYGON', 'STAR'].includes(node.type)) return 'path';
  if (node.type === 'GROUP') return 'group';
  if (['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION'].includes(node.type)) return 'frame';
  return node.children?.length ? 'group' : 'rectangle';
}

function imageRef(node: FigmaApiNode): string | null {
  if (!Array.isArray(node.fills)) return null;
  for (const value of node.fills) {
    const paint = object(value);
    if (paint.type === 'IMAGE' && typeof paint.imageRef === 'string') return paint.imageRef;
  }
  return null;
}

function blendMode(value: unknown): DesignElement['blendMode'] {
  const normalized = String(value ?? 'NORMAL').toLowerCase().replace('_', '-');
  return ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'].includes(normalized)
    ? normalized as DesignElement['blendMode']
    : 'normal';
}

function baseElement(
  node: FigmaApiNode,
  id: string,
  pageId: string,
  parentId: string | null,
  offset: { x: number; y: number },
  order: number,
  source: DesignFigmaSource,
  assetId: string | null,
): DesignElement {
  const bounds = box(node) ?? { x: 0, y: 0, width: 100, height: 100 };
  const resolvedFills = paints(node.fills);
  const resolvedStrokes = paints(node.strokes);
  const style = object(node.style);
  const geometry = Array.isArray(node.fillGeometry) ? object(node.fillGeometry[0]) : {};
  const parsedPath = typeof geometry.path === 'string' ? parseSvgPathData(geometry.path) : null;
  const type = nodeType(node, Boolean(imageRef(node)));
  return {
    id,
    pageId,
    parentId,
    type,
    name: String(node.name || node.type).slice(0, 120),
    x: bounds.x + offset.x,
    y: bounds.y + offset.y,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
    rotation: number(node.rotation),
    opacity: Math.max(0, Math.min(1, number(node.opacity, 1))),
    visible: node.visible !== false,
    locked: Boolean(node.locked),
    fill: resolvedFills[0]?.type === 'solid' ? resolvedFills[0].color : 'transparent',
    stroke: resolvedStrokes[0]?.type === 'solid' ? resolvedStrokes[0].color : 'transparent',
    strokeWidth: Math.max(0, number(node.strokeWeight)),
    fills: resolvedFills,
    strokes: resolvedStrokes,
    effects: effects(node.effects),
    blendMode: blendMode(node.blendMode),
    cornerRadius: Math.max(0, number(node.cornerRadius, number(node.topLeftRadius))),
    text: type === 'text' ? String(node.characters ?? '') : '',
    fontSize: Math.max(4, number(style.fontSize, 16)),
    fontWeight: Math.max(100, Math.min(900, Math.round(number(style.fontWeight, 400) / 100) * 100)),
    textAlign: String(style.textAlignHorizontal ?? 'LEFT').toLowerCase() === 'center' ? 'center' : String(style.textAlignHorizontal ?? '').toLowerCase() === 'right' ? 'right' : 'left',
    pathPoints: parsedPath?.subpaths.length === 1 ? parsedPath.subpaths[0] : [],
    pathSubpaths: parsedPath && parsedPath.subpaths.length > 1 ? parsedPath.subpaths : [],
    pathClosed: parsedPath?.closed ?? false,
    fillRule: String(geometry.windingRule ?? '').toUpperCase() === 'EVENODD' ? 'evenodd' : 'nonzero',
    assetId,
    imageFit: String(node.scaleMode ?? 'FILL').toUpperCase() === 'FIT' ? 'contain' : 'cover',
    maskId: null,
    isMask: Boolean(node.isMask),
    layoutMode: node.layoutMode === 'HORIZONTAL' ? 'horizontal' : node.layoutMode === 'VERTICAL' ? 'vertical' : 'none',
    layoutWrap: node.layoutWrap === 'WRAP',
    layoutGap: Math.max(0, number(node.itemSpacing, 16)),
    layoutRowGap: Math.max(0, number(node.counterAxisSpacing, number(node.itemSpacing, 16))),
    layoutColumnGap: Math.max(0, number(node.itemSpacing, 16)),
    layoutPaddingTop: Math.max(0, number(node.paddingTop, 24)),
    layoutPaddingRight: Math.max(0, number(node.paddingRight, 24)),
    layoutPaddingBottom: Math.max(0, number(node.paddingBottom, 24)),
    layoutPaddingLeft: Math.max(0, number(node.paddingLeft, 24)),
    layoutGridColumns: 2,
    layoutAlign: String(node.primaryAxisAlignItems ?? 'MIN') === 'CENTER' ? 'center' : String(node.primaryAxisAlignItems ?? '') === 'MAX' ? 'end' : String(node.primaryAxisAlignItems ?? '') === 'SPACE_BETWEEN' ? 'space-between' : 'start',
    clipContent: Boolean(node.clipsContent),
    constraintHorizontal: 'left',
    constraintVertical: 'top',
    variableBindings: {},
    componentId: null,
    instanceOf: null,
    instanceRootId: null,
    instanceSourceId: null,
    instanceProperties: {},
    instanceOverrides: {},
    slotAssignments: {},
    slotName: null,
    figmaSource: source,
    order,
  };
}

function componentPropertyType(value: unknown): 'text' | 'boolean' | null {
  if (value === 'TEXT') return 'text';
  if (value === 'BOOLEAN') return 'boolean';
  return null;
}

function variantValues(name: string): Record<string, string> {
  return Object.fromEntries(name.split(',').map((part) => part.split('=').map((value) => value.trim())).filter((pair) => pair.length === 2 && pair[0] && pair[1]) as Array<[string, string]>);
}

export function convertFigmaSelection(options: FigmaConversionOptions): FigmaConversion {
  const warnings = new Set<string>();
  const imageRefs = new Set<string>();
  const imageRefsByNode: Record<string, string> = {};
  const mappings: Record<string, string> = {};
  const baselineHashes: Record<string, string> = {};
  const rawNodes = new Map<string, FigmaApiNode>();
  const parentByNode = new Map<string, string | null>();
  const visit = (node: FigmaApiNode, parentId: string | null) => {
    rawNodes.set(node.id, node);
    parentByNode.set(node.id, parentId);
    for (const child of node.children ?? []) visit(child, node.id);
  };
  for (const source of options.sourceNodes) visit(source, null);
  const placementNodes = options.sourceNodes.flatMap((node) => ['DOCUMENT', 'CANVAS'].includes(node.type) ? node.children ?? [] : [node]);
  const bounds = placementNodes.map(box).filter((candidate): candidate is NonNullable<ReturnType<typeof box>> => Boolean(candidate));
  const minX = bounds.length ? Math.min(...bounds.map((candidate) => candidate.x)) : 0;
  const minY = bounds.length ? Math.min(...bounds.map((candidate) => candidate.y)) : 0;
  const offset = { x: (options.originX ?? 120) - minX, y: (options.originY ?? 120) - minY };
  const ids = new Map([...rawNodes.keys()].map((nodeId) => [nodeId, options.makeId()]));
  const componentIds = new Map([...rawNodes.values()].filter((node) => node.type === 'COMPONENT').map((node) => [node.id, options.makeId()]));
  const setIds = new Map([...rawNodes.values()].filter((node) => node.type === 'COMPONENT_SET').map((node) => [node.id, options.makeId()]));
  const nativeInstances = new Map([...rawNodes.values()].flatMap((node) => {
    const sourceComponentId = typeof node.componentId === 'string' ? node.componentId : null;
    return node.type === 'INSTANCE' && sourceComponentId && componentIds.has(sourceComponentId)
      ? [[node.id, sourceComponentId] as const]
      : [];
  }));
  const owningNativeInstance = (nodeId: string): string | null => {
    let current: string | null = nodeId;
    while (current) {
      if (nativeInstances.has(current)) return current;
      current = parentByNode.get(current) ?? null;
    }
    return null;
  };
  let order = 0;
  const elements: DesignElement[] = [];
  for (const node of rawNodes.values()) {
    if (['DOCUMENT', 'CANVAS'].includes(node.type)) continue;
    const instanceRootNodeId = owningNativeInstance(node.id);
    if (instanceRootNodeId && instanceRootNodeId !== node.id) continue;
    const ref = imageRef(node);
    if (ref) {
      imageRefs.add(ref);
      imageRefsByNode[node.id] = ref;
    }
    const hash = figmaNodeHash(node);
    const externalComponentId = node.type === 'INSTANCE' && typeof node.componentId === 'string'
      ? node.componentId
      : null;
    const metadata = object(
      options.components?.[externalComponentId ?? node.id]
      ?? options.componentSets?.[node.id],
    );
    const source: DesignFigmaSource = { linkId: options.linkId, nodeId: node.id, key: typeof metadata.key === 'string' ? metadata.key : null, sourceHash: hash, syncedAt: options.now };
    let parentNodeId = parentByNode.get(node.id) ?? null;
    while (parentNodeId && ['DOCUMENT', 'CANVAS'].includes(rawNodes.get(parentNodeId)?.type ?? '')) parentNodeId = parentByNode.get(parentNodeId) ?? null;
    const element = baseElement(node, ids.get(node.id)!, options.pageId, parentNodeId ? ids.get(parentNodeId)! : null, offset, order++, source, ref ? options.imageAssets?.[ref] ?? null : null);
    const sourceComponentNodeId = nativeInstances.get(node.id);
    if (sourceComponentNodeId) {
      element.instanceOf = componentIds.get(sourceComponentNodeId)!;
      element.instanceRootId = element.id;
      element.instanceSourceId = ids.get(sourceComponentNodeId)!;
    } else if (externalComponentId && metadata.key) {
      warnings.add('external_library_component_preserved');
    }
    elements.push(element);
    mappings[node.id] = element.id;
    baselineHashes[node.id] = hash;
    if (!['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION', 'RECTANGLE', 'ELLIPSE', 'TEXT', 'VECTOR', 'BOOLEAN_OPERATION', 'LINE', 'POLYGON', 'STAR'].includes(node.type)) warnings.add(node.type);
  }

  const componentSets: DesignComponentSet[] = [...setIds].map(([nodeId, id], index) => {
    const node = rawNodes.get(nodeId)!;
    const definitions = object(node.componentPropertyDefinitions);
    const hash = baselineHashes[nodeId];
    return {
      id,
      name: node.name.slice(0, 160),
      propertyNames: Object.keys(definitions).slice(0, 32),
      order: index,
      libraryId: null,
      librarySourceId: null,
      figmaSource: { linkId: options.linkId, nodeId, key: String(object(options.componentSets?.[nodeId]).key || '') || null, sourceHash: hash, syncedAt: options.now },
    };
  });

  const descendants = (rootId: string) => {
    const found = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [nodeId, parentId] of parentByNode) if (parentId && found.has(parentId) && !found.has(nodeId)) { found.add(nodeId); changed = true; }
    }
    return [...found].map((nodeId) => rawNodes.get(nodeId)!).filter(Boolean);
  };
  const components: DesignComponent[] = [...componentIds].map(([nodeId, id]) => {
    const node = rawNodes.get(nodeId)!;
    const sourceNodes = descendants(nodeId);
    const definitions = object(node.componentPropertyDefinitions);
    const properties: DesignComponentProperty[] = Object.entries(definitions).flatMap(([name, definition], index) => {
      const def = object(definition);
      const type = componentPropertyType(def.type);
      if (!type) return [];
      const target = type === 'text'
        ? sourceNodes.find((candidate) => candidate.type === 'TEXT')
        : sourceNodes.find((candidate) => candidate.id !== nodeId);
      if (!target) return [];
      return [{
        id: options.makeId(),
        name: name.replace(/#\d+:\d+$/, '').slice(0, 120),
        type,
        targetElementId: ids.get(target.id)!,
        defaultValue: type === 'text' ? String(def.defaultValue ?? target.characters ?? '') : Boolean(def.defaultValue ?? true),
        preferredValues: [],
        order: index,
      }];
    });
    const setNodeId = parentByNode.get(nodeId);
    const metadata = object(options.components?.[nodeId]);
    return {
      id,
      name: node.name.slice(0, 160),
      description: String(metadata.description ?? '').slice(0, 1_000),
      rootElementId: ids.get(nodeId)!,
      setId: setNodeId && setIds.has(setNodeId) ? setIds.get(setNodeId)! : null,
      variantValues: variantValues(node.name),
      properties,
      key: String(metadata.key ?? `figma-${options.fileKey}-${nodeId}`).slice(0, 240),
      libraryId: null,
      librarySourceId: null,
      codeConnect: null,
      figmaSource: { linkId: options.linkId, nodeId, key: typeof metadata.key === 'string' ? metadata.key : null, sourceHash: baselineHashes[nodeId], syncedAt: options.now },
      updatedAt: options.now,
    };
  });
  return {
    elements,
    components,
    componentSets,
    mappings,
    baselineHashes,
    imageRefs: [...imageRefs],
    imageRefsByNode,
    warnings: [...warnings].sort(),
    originX: options.originX ?? 120,
    originY: options.originY ?? 120,
  };
}

function variableType(name: string, resolvedType: unknown): DesignVariableType {
  if (resolvedType === 'COLOR') return 'color';
  if (resolvedType === 'BOOLEAN') return 'boolean';
  if (resolvedType === 'STRING') return 'string';
  const lower = name.toLowerCase();
  if (lower.includes('radius')) return 'radius';
  if (lower.includes('opacity')) return 'opacity';
  if (lower.includes('font') && lower.includes('size')) return 'font-size';
  if (lower.includes('weight')) return 'font-weight';
  if (lower.includes('breakpoint')) return 'breakpoint';
  return 'spacing';
}

function figmaVariableValue(value: unknown, type: DesignVariableType, ids: Map<string, string>): DesignVariableValue | null {
  const record = object(value);
  if (record.type === 'VARIABLE_ALIAS' && typeof record.id === 'string' && ids.has(record.id)) return { kind: 'alias', variableId: ids.get(record.id)! };
  if (type === 'color') return { kind: 'color', value: color(value) };
  if (type === 'boolean') return { kind: 'boolean', value: Boolean(value) };
  if (type === 'string') return { kind: 'string', value: String(value ?? '') };
  const numeric = number(value, Number.NaN);
  return Number.isFinite(numeric) ? { kind: 'number', value: numeric } : null;
}

export function convertFigmaVariables(payload: Record<string, unknown> | null, linkId: string, makeId: () => string, now: string): { collections: DesignVariableCollection[]; variables: DesignVariable[]; warnings: string[] } {
  const meta = object(payload?.meta);
  const sourceCollections = object(meta.variableCollections);
  const sourceVariables = object(meta.variables);
  if (!Object.keys(sourceCollections).length || !Object.keys(sourceVariables).length) return { collections: [], variables: [], warnings: payload ? [] : ['variables_unavailable'] };
  const collectionIds = new Map(Object.keys(sourceCollections).map((id) => [id, makeId()]));
  const modeIds = new Map<string, string>();
  const variableIds = new Map(Object.keys(sourceVariables).map((id) => [id, makeId()]));
  const collections: DesignVariableCollection[] = Object.entries(sourceCollections).map(([sourceId, value], order) => {
    const source = object(value);
    const modes = Array.isArray(source.modes) ? source.modes.map((modeValue) => {
      const mode = object(modeValue);
      const id = makeId();
      modeIds.set(String(mode.modeId), id);
      return { id, name: String(mode.name || 'Mode').slice(0, 80) };
    }) : [];
    const safeModes = modes.length ? modes : [{ id: makeId(), name: 'Default' }];
    return {
      id: collectionIds.get(sourceId)!,
      name: String(source.name || 'Figma variables').slice(0, 120),
      modes: safeModes,
      defaultModeId: safeModes[0].id,
      order,
      libraryId: null,
      librarySourceId: null,
      codeSource: null,
      figmaSource: { linkId, nodeId: sourceId, key: typeof source.key === 'string' ? source.key : null, sourceHash: figmaNodeHash(source), syncedAt: now },
    };
  });
  const warnings = new Set<string>();
  const variables: DesignVariable[] = [];
  for (const [sourceId, value] of Object.entries(sourceVariables)) {
    const source = object(value);
    const collectionId = collectionIds.get(String(source.variableCollectionId));
    if (!collectionId) { warnings.add('variable_collection_missing'); continue; }
    const type = variableType(String(source.name), source.resolvedType);
    const values: Record<string, DesignVariableValue> = {};
    for (const [sourceModeId, raw] of Object.entries(object(source.valuesByMode))) {
      const modeId = modeIds.get(sourceModeId);
      const converted = figmaVariableValue(raw, type, variableIds);
      if (modeId && converted) values[modeId] = converted;
    }
    const collection = collections.find((candidate) => candidate.id === collectionId)!;
    if (!values[collection.defaultModeId]) {
      values[collection.defaultModeId] = type === 'color' ? { kind: 'color', value: '#000000' } : type === 'boolean' ? { kind: 'boolean', value: false } : type === 'string' ? { kind: 'string', value: '' } : { kind: 'number', value: 0 };
      warnings.add('variable_default_missing');
    }
    variables.push({
      id: variableIds.get(sourceId)!,
      collectionId,
      name: String(source.name || 'Variable').slice(0, 160),
      type,
      description: String(source.description ?? '').slice(0, 1_000),
      values,
      order: variables.length,
      libraryId: null,
      librarySourceId: null,
      codeSourceKey: null,
      figmaSource: { linkId, nodeId: sourceId, key: typeof source.key === 'string' ? source.key : null, sourceHash: figmaNodeHash(source), syncedAt: now },
    });
  }
  return { collections, variables, warnings: [...warnings] };
}

export function convertFigmaStyles(
  styles: Record<string, Record<string, unknown>>,
  sourceNodes: FigmaApiNode[],
  linkId: string,
  makeId: () => string,
  now: string,
): { collections: DesignVariableCollection[]; variables: DesignVariable[] } {
  const references = new Map<string, { property: string; node: FigmaApiNode }>();
  const visit = (node: FigmaApiNode) => {
    for (const [property, styleId] of Object.entries(object(node.styles))) {
      if (typeof styleId === 'string' && !references.has(styleId)) references.set(styleId, { property, node });
    }
    for (const child of node.children ?? []) visit(child);
  };
  sourceNodes.forEach(visit);
  if (!references.size) return { collections: [], variables: [] };
  const collectionId = makeId();
  const modeId = makeId();
  const collection: DesignVariableCollection = {
    id: collectionId,
    name: 'Figma styles',
    modes: [{ id: modeId, name: 'Default' }],
    defaultModeId: modeId,
    order: 0,
    libraryId: null,
    librarySourceId: null,
    codeSource: null,
    figmaSource: { linkId, nodeId: 'styles', key: null, sourceHash: figmaNodeHash(styles), syncedAt: now },
  };
  const variables: DesignVariable[] = [];
  for (const [styleId, reference] of references) {
    const metadata = object(styles[styleId]);
    const styleType = String(metadata.styleType ?? reference.property).toUpperCase();
    let type: DesignVariableType = 'string';
    let value: DesignVariableValue | null = null;
    if (styleType.includes('FILL') || styleType.includes('STROKE')) {
      const resolved = paints(styleType.includes('STROKE') ? reference.node.strokes : reference.node.fills)[0];
      if (resolved?.type === 'solid') { type = 'color'; value = { kind: 'color', value: resolved.color }; }
    } else if (styleType.includes('EFFECT')) {
      type = 'effect';
      value = { kind: 'effect', value: effects(reference.node.effects) };
    } else if (styleType.includes('TEXT')) {
      type = 'font-size';
      value = { kind: 'number', value: Math.max(4, number(object(reference.node.style).fontSize, 16)) };
    }
    if (!value) continue;
    variables.push({
      id: makeId(),
      collectionId,
      name: String(metadata.name || reference.node.name || styleId).slice(0, 160),
      type,
      description: String(metadata.description ?? '').slice(0, 1_000),
      values: { [modeId]: value },
      order: variables.length,
      libraryId: null,
      librarySourceId: null,
      codeSourceKey: null,
      figmaSource: { linkId, nodeId: styleId, key: typeof metadata.key === 'string' ? metadata.key : null, sourceHash: figmaNodeHash({ metadata, value }), syncedAt: now },
    });
  }
  return variables.length ? { collections: [collection], variables } : { collections: [], variables: [] };
}

export function nodesFromPayload(payload: FigmaNodesPayload, ids: string[]): FigmaApiNode[] {
  return ids.map((id) => payload.nodes[id]?.document).filter((node): node is FigmaApiNode => Boolean(node));
}
