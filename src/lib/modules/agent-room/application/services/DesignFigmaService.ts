import { uuidv7 } from '@beeblock/svelar/support';
import type {
  DesignDocument,
  DesignElement,
  DesignFigmaLink,
  DesignOperation,
} from '../../contracts/schemas/designSchemas.js';
import {
  convertFigmaSelection,
  convertFigmaStyles,
  convertFigmaVariables,
  figmaLocalElementHash,
  figmaNodeHash,
  inspectFigmaFile,
  nodesFromPayload,
  normalizeFigmaNodeId,
  parseFigmaUrl,
  type FigmaConversion,
} from '../../domain/design-figma.js';
import { FIGMA_MCP_URL } from '../../infrastructure/codex-mcp-config.js';
import { desktopSecretService } from '../../infrastructure/secrets/DesktopSecretService.js';
import { figmaApiClient, type FigmaApiNode, type FigmaNodesPayload } from '../../infrastructure/figma/FigmaApiClient.js';
import type {
  ApplyDesignFigmaSyncDto,
  ImportDesignFigmaDto,
  InspectDesignFigmaDto,
  PreviewDesignFigmaSyncDto,
} from '../dto/DesignFigmaDtos.js';
import { ApplyDesignOperationsDto } from '../dto/DesignDtos.js';
import { DesignRevisionConflictError, designDocumentService } from './DesignDocumentService.js';

const actor = { kind: 'system' as const, id: null, name: 'Figma', taskId: null };

export type FigmaSyncState = 'added' | 'changed' | 'local' | 'conflict' | 'removed' | 'unchanged';

export type FigmaSyncChange = {
  nodeId: string;
  localElementId: string | null;
  name: string;
  type: string;
  state: FigmaSyncState;
  figmaChanged: boolean;
  localChanged: boolean;
  defaultResolution: 'figma' | 'local' | 'delete';
};

function secretKey(workspaceId: string): string {
  return `automation:figma:${workspaceId}`;
}

function extension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'png';
}

function imageAssetMatchesMime(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mimeType === 'image/gif') return String.fromCharCode(...bytes.slice(0, 4)) === 'GIF8';
  if (mimeType === 'image/webp') {
    return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}

function elementChanges(element: DesignElement): DesignOperation & { kind: 'update' } {
  const {
    id,
    pageId: _pageId,
    parentId: _parentId,
    type: _type,
    componentId: _componentId,
    instanceOf: _instanceOf,
    instanceRootId: _instanceRootId,
    instanceSourceId: _instanceSourceId,
    instanceProperties: _instanceProperties,
    instanceOverrides: _instanceOverrides,
    slotAssignments: _slotAssignments,
    ...changes
  } = element;
  return { kind: 'update', elementId: id, changes };
}

function sourceId(element: DesignElement): string | null {
  return element.figmaSource?.nodeId ?? null;
}

function metadataFromPayload(payload: FigmaNodesPayload) {
  const components: Record<string, Record<string, unknown>> = {};
  const componentSets: Record<string, Record<string, unknown>> = {};
  for (const result of Object.values(payload.nodes)) {
    if (!result) continue;
    Object.assign(components, result.components ?? {});
    Object.assign(componentSets, result.componentSets ?? {});
  }
  return { components, componentSets };
}

export class DesignFigmaService {
  private async token(workspaceId: string): Promise<string> {
    const token = await desktopSecretService.get(secretKey(workspaceId));
    if (!token) throw new Error('figma_credential_missing');
    return token;
  }

  private async refreshImportedLocalHashes(document: DesignDocument, linkId: string): Promise<DesignDocument> {
    const link = document.figmaLinks.find((candidate) => candidate.id === linkId);
    if (!link) return document;
    const hashes = Object.fromEntries(Object.entries(link.mappings).flatMap(([nodeId, elementId]) => {
      const element = document.elements.find((candidate) => candidate.id === elementId);
      return element ? [[nodeId, figmaLocalElementHash(element)]] : [];
    }));
    if (JSON.stringify(hashes) === JSON.stringify(link.localHashes)) return document;
    return designDocumentService.apply(new ApplyDesignOperationsDto(
      document.workspaceId,
      document.nodeId,
      document.revision,
      [{ kind: 'update-figma-link', linkId, changes: { localHashes: hashes } }],
      actor,
      'Finalize Figma import baseline',
    ));
  }

  async status(workspaceId: string) {
    const token = await desktopSecretService.get(secretKey(workspaceId));
    if (!token) {
      return {
        secretKey: secretKey(workspaceId),
        stored: false,
        connected: false,
        account: null,
        mcp: { url: FIGMA_MCP_URL, managed: true, authentication: 'provider' },
      };
    }
    try {
      const account = await figmaApiClient.me(token);
      return {
        secretKey: secretKey(workspaceId),
        stored: true,
        connected: true,
        account,
        mcp: { url: FIGMA_MCP_URL, managed: true, authentication: 'provider' },
      };
    } catch (error) {
      return {
        secretKey: secretKey(workspaceId),
        stored: true,
        connected: false,
        account: null,
        error: error instanceof Error ? error.message : 'figma_connection_failed',
        mcp: { url: FIGMA_MCP_URL, managed: true, authentication: 'provider' },
      };
    }
  }

  async inspect(dto: InspectDesignFigmaDto) {
    await designDocumentService.get(dto.workspaceId, dto.nodeId);
    const token = await this.token(dto.workspaceId);
    const parsed = parseFigmaUrl(dto.url);
    const file = await figmaApiClient.file(parsed.fileKey, token, 2);
    const inspection = inspectFigmaFile(parsed, file);
    if (parsed.nodeId && !inspection.nodes.some((node) => node.id === parsed.nodeId)) {
      const payload = await figmaApiClient.nodes(parsed.fileKey, [parsed.nodeId], token);
      const selected = nodesFromPayload(payload, [parsed.nodeId])[0];
      if (selected) {
        const bounds = selected.absoluteBoundingBox as Record<string, unknown> | undefined;
        inspection.nodes.unshift({
          id: selected.id,
          name: selected.name,
          type: selected.type,
          pageId: '',
          pageName: '',
          width: Number.isFinite(Number(bounds?.width)) ? Number(bounds?.width) : null,
          height: Number.isFinite(Number(bounds?.height)) ? Number(bounds?.height) : null,
          children: selected.children?.length ?? 0,
        });
      }
    }
    return inspection;
  }

  private async snapshot(fileKey: string, sourceNodeIds: string[], token: string) {
    const ids = [...new Set(sourceNodeIds.map(normalizeFigmaNodeId))];
    const payload = await figmaApiClient.nodes(fileKey, ids, token);
    const sourceNodes = nodesFromPayload(payload, ids);
    if (sourceNodes.length !== ids.length) throw new Error('figma_nodes_missing');
    return { payload, sourceNodes, ...metadataFromPayload(payload) };
  }

  private convert(
    document: DesignDocument,
    linkId: string,
    fileKey: string,
    pageId: string,
    snapshot: Awaited<ReturnType<DesignFigmaService['snapshot']>>,
    now: string,
    imageAssets: Record<string, string> = {},
    origin?: { x: number; y: number },
  ) {
    return convertFigmaSelection({
      linkId,
      fileKey,
      pageId,
      sourceNodes: snapshot.sourceNodes,
      components: snapshot.components,
      componentSets: snapshot.componentSets,
      imageAssets,
      makeId: uuidv7,
      now,
      originX: origin?.x,
      originY: origin?.y,
    });
  }

  async import(dto: ImportDesignFigmaDto) {
    let document = await designDocumentService.get(dto.workspaceId, dto.nodeId);
    if (document.revision !== dto.baseRevision) throw new DesignRevisionConflictError(document);
    if (!document.pages.some((page) => page.id === dto.targetPageId)) throw new Error('design_page_not_found');
    const parsed = parseFigmaUrl(dto.url);
    const sourceNodeIds = [...new Set(dto.sourceNodeIds.map(normalizeFigmaNodeId))];
    if (document.figmaLinks.some((link) => link.fileKey === parsed.fileKey && sourceNodeIds.some((id) => link.sourceNodeIds.includes(id)))) {
      throw new Error('figma_nodes_already_linked');
    }
    const token = await this.token(dto.workspaceId);
    const [snapshot, file, variablePayload, imageUrls] = await Promise.all([
      this.snapshot(parsed.fileKey, sourceNodeIds, token),
      figmaApiClient.file(parsed.fileKey, token, 1),
      figmaApiClient.localVariables(parsed.fileKey, token),
      figmaApiClient.imageFills(parsed.fileKey, token),
    ]);
    const linkId = uuidv7();
    const now = new Date().toISOString();
    let conversion = this.convert(document, linkId, parsed.fileKey, dto.targetPageId, snapshot, now);
    if (conversion.elements.length > 1_700) throw new Error('figma_selection_too_large');
    const warnings = new Set(conversion.warnings);
    const imageAssets: Record<string, string> = {};
    for (const ref of conversion.imageRefs) {
      const url = imageUrls[ref];
      if (!url) { warnings.add('image_unavailable'); continue; }
      try {
        const downloaded = await figmaApiClient.downloadAsset(url);
        const bytes = Uint8Array.from(downloaded.bytes);
        const assetFile = new File([bytes.buffer], `figma-${ref.slice(0, 32)}.${extension(downloaded.mimeType)}`, { type: downloaded.mimeType });
        document = await designDocumentService.importAsset(dto.workspaceId, dto.nodeId, document.revision, assetFile, { width: null, height: null });
        imageAssets[ref] = document.assets.at(-1)!.id;
      } catch {
        warnings.add('image_download_failed');
      }
    }
    if (Object.keys(imageAssets).length) conversion = this.convert(document, linkId, parsed.fileKey, dto.targetPageId, snapshot, now, imageAssets);
    const variables = convertFigmaVariables(variablePayload, linkId, uuidv7, now);
    const styles = convertFigmaStyles(file.styles ?? {}, snapshot.sourceNodes, linkId, uuidv7, now);
    variables.warnings.forEach((warning) => warnings.add(warning));
    const localHashes = Object.fromEntries(conversion.elements.flatMap((element) => element.figmaSource ? [[element.figmaSource.nodeId, figmaLocalElementHash(element)]] : []));
    const link: DesignFigmaLink = {
      id: linkId,
      fileKey: parsed.fileKey,
      fileName: file.name,
      url: parsed.canonicalUrl,
      sourceNodeIds,
      sourceVersion: file.version ?? null,
      sourceLastModified: file.lastModified ?? null,
      originX: conversion.originX,
      originY: conversion.originY,
      mappings: conversion.mappings,
      baselineHashes: conversion.baselineHashes,
      localHashes,
      imageRefs: conversion.imageRefsByNode,
      pendingPushNodeIds: [],
      importedAt: now,
      syncedAt: now,
    };
    const operations: DesignOperation[] = [
      { kind: 'add-figma-link', link },
      ...conversion.elements.map((element) => ({ kind: 'create' as const, element })),
      ...conversion.componentSets.map((componentSet) => ({ kind: 'add-component-set' as const, componentSet })),
      ...conversion.components.map((component) => ({ kind: 'add-component' as const, component })),
      ...[...variables.collections, ...styles.collections].map((collection) => ({ kind: 'add-variable-collection' as const, collection })),
      ...[...variables.variables, ...styles.variables].map((variable) => ({ kind: 'add-variable' as const, variable })),
    ];
    document = await designDocumentService.apply(new ApplyDesignOperationsDto(
      dto.workspaceId,
      dto.nodeId,
      document.revision,
      operations,
      actor,
      `Import Figma selection from ${file.name}`,
    ));
    document = await this.refreshImportedLocalHashes(document, linkId);
    return {
      document,
      linkId,
      warnings: [...warnings].sort(),
      counts: {
        elements: conversion.elements.length,
        components: conversion.components.length,
        componentSets: conversion.componentSets.length,
        variables: variables.variables.length + styles.variables.length,
        assets: Object.keys(imageAssets).length,
      },
    };
  }

  async importPluginSelection(input: {
    workspaceId: string;
    nodeId: string;
    baseRevision: number;
    fileKey: string;
    fileName: string;
    sourceNodes: Record<string, unknown>[];
    imageAssets: Record<string, { mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; base64: string }>;
    targetPageId: string;
    summary: string;
  }) {
    let document = await designDocumentService.get(input.workspaceId, input.nodeId);
    if (document.revision !== input.baseRevision) throw new DesignRevisionConflictError(document);
    if (!document.pages.some((page) => page.id === input.targetPageId)) throw new Error('design_page_not_found');
    const sourceNodes = input.sourceNodes.map((candidate) => {
      if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || typeof candidate.type !== 'string') {
        throw new Error('figma_plugin_selection_invalid');
      }
      return candidate as FigmaApiNode;
    });
    const sourceNodeIds = sourceNodes.map((node) => normalizeFigmaNodeId(node.id));
    if (document.figmaLinks.some((link) => link.fileKey === input.fileKey && sourceNodeIds.some((id) => link.sourceNodeIds.includes(id)))) {
      throw new Error('figma_nodes_already_linked');
    }
    const linkId = uuidv7();
    const now = new Date().toISOString();
    const snapshot = {
      payload: { nodes: {} } as FigmaNodesPayload,
      sourceNodes,
      components: {},
      componentSets: {},
    };
    let conversion = this.convert(document, linkId, input.fileKey, input.targetPageId, snapshot, now);
    if (conversion.elements.length > 1_700) throw new Error('figma_selection_too_large');
    const expectedImageRefs = new Set(conversion.imageRefs);
    if (Object.keys(input.imageAssets).length > 100) throw new Error('figma_plugin_assets_too_large');
    const importedAssets: Record<string, string> = {};
    let totalAssetBytes = 0;
    for (const [ref, asset] of Object.entries(input.imageAssets)) {
      if (!expectedImageRefs.has(ref)) continue;
      const bytes = Buffer.from(asset.base64, 'base64');
      totalAssetBytes += bytes.byteLength;
      if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024 || totalAssetBytes > 40 * 1024 * 1024) throw new Error('figma_plugin_assets_too_large');
      if (!imageAssetMatchesMime(bytes, asset.mimeType)) throw new Error('figma_plugin_asset_type_mismatch');
      const assetFile = new File([Uint8Array.from(bytes).buffer], `figma-${ref.slice(0, 32)}.${extension(asset.mimeType)}`, { type: asset.mimeType });
      document = await designDocumentService.importAsset(input.workspaceId, input.nodeId, document.revision, assetFile, { width: null, height: null });
      importedAssets[ref] = document.assets.at(-1)!.id;
    }
    if (Object.keys(importedAssets).length) conversion = this.convert(document, linkId, input.fileKey, input.targetPageId, snapshot, now, importedAssets);
    const localHashes = Object.fromEntries(conversion.elements.flatMap((element) => element.figmaSource ? [[element.figmaSource.nodeId, figmaLocalElementHash(element)]] : []));
    const link: DesignFigmaLink = {
      id: linkId,
      fileKey: input.fileKey,
      fileName: input.fileName,
      url: `https://www.figma.com/design/${input.fileKey}/Orkestrai`,
      sourceNodeIds,
      sourceVersion: null,
      sourceLastModified: null,
      originX: conversion.originX,
      originY: conversion.originY,
      mappings: conversion.mappings,
      baselineHashes: conversion.baselineHashes,
      localHashes,
      imageRefs: conversion.imageRefsByNode,
      pendingPushNodeIds: [],
      importedAt: now,
      syncedAt: now,
    };
    const operations: DesignOperation[] = [
      { kind: 'add-figma-link', link },
      ...conversion.elements.map((element) => ({ kind: 'create' as const, element })),
      ...conversion.componentSets.map((componentSet) => ({ kind: 'add-component-set' as const, componentSet })),
      ...conversion.components.map((component) => ({ kind: 'add-component' as const, component })),
    ];
    let next = await designDocumentService.apply(new ApplyDesignOperationsDto(
      input.workspaceId,
      input.nodeId,
      document.revision,
      operations,
      actor,
      input.summary,
    ));
    next = await this.refreshImportedLocalHashes(next, linkId);
    return { document: next, linkId, warnings: conversion.warnings, counts: { elements: conversion.elements.length, components: conversion.components.length, assets: Object.keys(importedAssets).length } };
  }

  private async syncContext(workspaceId: string, nodeId: string, linkId: string) {
    const document = await designDocumentService.get(workspaceId, nodeId);
    const link = document.figmaLinks.find((candidate) => candidate.id === linkId);
    if (!link) throw new Error('figma_link_not_found');
    const token = await this.token(workspaceId);
    const snapshot = await this.snapshot(link.fileKey, link.sourceNodeIds, token);
    const conversion = this.convert(document, link.id, link.fileKey, document.activePageId, snapshot, new Date().toISOString(), {}, { x: link.originX, y: link.originY });
    for (const candidate of conversion.elements) {
      const nodeId = candidate.figmaSource?.nodeId;
      const localId = nodeId ? link.mappings[nodeId] : null;
      const local = localId ? document.elements.find((element) => element.id === localId) : null;
      if (candidate.type === 'image' && local?.assetId) candidate.assetId = local.assetId;
    }
    return { document, link, token, snapshot, conversion };
  }

  private changes(document: DesignDocument, link: DesignFigmaLink, conversion: FigmaConversion): FigmaSyncChange[] {
    const candidates = new Map(conversion.elements.flatMap((element) => element.figmaSource ? [[element.figmaSource.nodeId, element]] : []));
    const ids = new Set([...Object.keys(link.baselineHashes), ...candidates.keys()]);
    const changes: FigmaSyncChange[] = [];
    for (const nodeId of ids) {
      const candidate = candidates.get(nodeId);
      const localId = link.mappings[nodeId] ?? null;
      const local = localId ? document.elements.find((element) => element.id === localId) ?? null : null;
      const baseline = link.baselineHashes[nodeId];
      const remoteHash = candidate?.figmaSource?.sourceHash ?? null;
      const localHash = local ? figmaLocalElementHash(local) : null;
      const figmaChanged = remoteHash !== baseline;
      const localChanged = Boolean(local && localHash !== link.localHashes[nodeId]);
      let state: FigmaSyncState = 'unchanged';
      if (!baseline && candidate) state = 'added';
      else if (baseline && !candidate) state = localChanged ? 'conflict' : 'removed';
      else if (figmaChanged && localChanged) state = 'conflict';
      else if (figmaChanged) state = 'changed';
      else if (localChanged) state = 'local';
      changes.push({
        nodeId,
        localElementId: localId,
        name: candidate?.name ?? local?.name ?? nodeId,
        type: candidate?.type ?? local?.type ?? 'UNKNOWN',
        state,
        figmaChanged,
        localChanged,
        defaultResolution: state === 'removed' ? 'delete' : state === 'local' ? 'local' : state === 'conflict' ? 'local' : 'figma',
      });
    }
    return changes.sort((left, right) => Number(left.state === 'unchanged') - Number(right.state === 'unchanged') || left.name.localeCompare(right.name));
  }

  async preview(dto: PreviewDesignFigmaSyncDto) {
    const context = await this.syncContext(dto.workspaceId, dto.nodeId, dto.linkId);
    return {
      link: context.link,
      revision: context.document.revision,
      changes: this.changes(context.document, context.link, context.conversion),
    };
  }

  async applySync(dto: ApplyDesignFigmaSyncDto) {
    const context = await this.syncContext(dto.workspaceId, dto.nodeId, dto.linkId);
    if (context.document.revision !== dto.baseRevision) throw new DesignRevisionConflictError(context.document);
    const selected = new Map(dto.changes.map((change) => [normalizeFigmaNodeId(change.nodeId), change.resolution]));
    const preview = this.changes(context.document, context.link, context.conversion);
    const candidates = new Map(context.conversion.elements.flatMap((element) => element.figmaSource ? [[element.figmaSource.nodeId, element]] : []));
    const convertedIdToSource = new Map([...candidates].map(([nodeId, element]) => [element.id, nodeId]));
    let document = context.document;
    const imageRefs = { ...context.link.imageRefs };
    const imagesToDownload = context.conversion.elements.filter((candidate) => {
      const nodeId = candidate.figmaSource?.nodeId;
      const ref = nodeId ? context.conversion.imageRefsByNode[nodeId] : null;
      return Boolean(nodeId && ref && selected.get(nodeId) === 'figma' && ref !== context.link.imageRefs[nodeId]);
    });
    if (imagesToDownload.length) {
      const imageUrls = await figmaApiClient.imageFills(context.link.fileKey, context.token);
      for (const candidate of imagesToDownload) {
        const nodeId = candidate.figmaSource!.nodeId;
        const ref = context.conversion.imageRefsByNode[nodeId];
        const url = imageUrls[ref];
        if (!url) throw new Error('figma_image_unavailable');
        const downloaded = await figmaApiClient.downloadAsset(url);
        const bytes = Uint8Array.from(downloaded.bytes);
        const assetFile = new File([bytes.buffer], `figma-${ref.slice(0, 32)}.${extension(downloaded.mimeType)}`, { type: downloaded.mimeType });
        document = await designDocumentService.importAsset(dto.workspaceId, dto.nodeId, document.revision, assetFile, { width: null, height: null });
        candidate.assetId = document.assets.at(-1)!.id;
      }
    }
    const mappings = { ...context.link.mappings };
    const baselineHashes = { ...context.link.baselineHashes };
    const localHashes = { ...context.link.localHashes };
    const pendingPushNodeIds = new Set(context.link.pendingPushNodeIds);
    const operations: DesignOperation[] = [];
    const componentIdMap = new Map(context.conversion.components.map((component) => {
      const existing = context.document.components.find((candidate) => candidate.figmaSource?.linkId === context.link.id && candidate.figmaSource.nodeId === component.figmaSource?.nodeId);
      return [component.id, existing?.id ?? component.id];
    }));
    const componentSetIdMap = new Map(context.conversion.componentSets.map((set) => {
      const existing = context.document.componentSets.find((candidate) => candidate.figmaSource?.linkId === context.link.id && candidate.figmaSource.nodeId === set.figmaSource?.nodeId);
      return [set.id, existing?.id ?? set.id];
    }));
    const mappedElementId = (convertedId: string | null): string | null => {
      if (!convertedId) return null;
      const mappedSourceId = convertedIdToSource.get(convertedId);
      return mappedSourceId ? mappings[mappedSourceId] ?? convertedId : convertedId;
    };
    const normalizeCandidate = (candidate: DesignElement, id: string): DesignElement => ({
      ...candidate,
      id,
      parentId: mappedElementId(candidate.parentId),
      componentId: null,
      instanceOf: candidate.instanceOf ? componentIdMap.get(candidate.instanceOf) ?? candidate.instanceOf : null,
      instanceRootId: candidate.instanceRootId === candidate.id ? id : mappedElementId(candidate.instanceRootId),
      instanceSourceId: mappedElementId(candidate.instanceSourceId),
    });
    for (const candidate of context.conversion.elements) {
      const nodeId = candidate.figmaSource?.nodeId;
      if (nodeId && selected.get(nodeId) === 'figma' && !mappings[nodeId]) mappings[nodeId] = candidate.id;
    }
    const deletionIds = new Set(preview.flatMap((change) => {
      const resolution = selected.get(change.nodeId);
      return resolution === 'delete' && change.localElementId ? [change.localElementId] : [];
    }));
    const hasDeletedAncestor = (element: DesignElement): boolean => {
      let parentId = element.parentId;
      while (parentId) {
        if (deletionIds.has(parentId)) return true;
        parentId = context.document.elements.find((candidate) => candidate.id === parentId)?.parentId ?? null;
      }
      return false;
    };
    for (const component of context.document.components.filter((candidate) => {
      const root = context.document.elements.find((element) => element.id === candidate.rootElementId);
      return Boolean(root && (deletionIds.has(root.id) || hasDeletedAncestor(root)));
    })) {
      operations.push({ kind: 'delete-component', componentId: component.id });
    }
    for (const set of context.document.componentSets.filter((candidate) => candidate.figmaSource && selected.get(candidate.figmaSource.nodeId) === 'delete')) {
      operations.push({ kind: 'delete-component-set', componentSetId: set.id });
    }
    for (const change of preview) {
      const resolution = selected.get(change.nodeId);
      if (!resolution || change.state === 'unchanged') continue;
      const candidate = candidates.get(change.nodeId);
      const localId = mappings[change.nodeId];
      const local = localId ? context.document.elements.find((element) => element.id === localId) : null;
      if (resolution === 'delete') {
        if (local && !hasDeletedAncestor(local)) operations.push({ kind: 'delete', elementId: local.id });
        delete mappings[change.nodeId];
        delete baselineHashes[change.nodeId];
        delete localHashes[change.nodeId];
        delete imageRefs[change.nodeId];
        pendingPushNodeIds.delete(change.nodeId);
        continue;
      }
      if (resolution === 'local') {
        if (local && candidate) {
          localHashes[change.nodeId] = figmaLocalElementHash(local);
          baselineHashes[change.nodeId] = candidate.figmaSource!.sourceHash;
          pendingPushNodeIds.add(change.nodeId);
        } else if (local) {
          operations.push({ kind: 'update', elementId: local.id, changes: { figmaSource: null } });
          delete mappings[change.nodeId];
          delete baselineHashes[change.nodeId];
          delete localHashes[change.nodeId];
          delete imageRefs[change.nodeId];
          pendingPushNodeIds.delete(change.nodeId);
        }
        continue;
      }
      pendingPushNodeIds.delete(change.nodeId);
    }
    for (const candidate of context.conversion.elements) {
      const nodeId = candidate.figmaSource?.nodeId;
      if (!nodeId || selected.get(nodeId) !== 'figma') continue;
      const localId = context.link.mappings[nodeId];
      const local = localId ? context.document.elements.find((element) => element.id === localId) : null;
      const mappedId = mappings[nodeId];
      const normalized = normalizeCandidate(candidate, mappedId);
      if (local) {
        const updated = { ...normalized, id: local.id, pageId: local.pageId, type: local.type };
        operations.push(elementChanges(updated));
        if (updated.parentId !== local.parentId) operations.push({ kind: 'reparent', elementId: local.id, parentId: updated.parentId, order: updated.order });
        localHashes[nodeId] = figmaLocalElementHash(updated);
      } else {
        const created = { ...normalized, order: document.elements.length + candidate.order };
        operations.push({ kind: 'create', element: created });
        localHashes[nodeId] = figmaLocalElementHash(created);
      }
      baselineHashes[nodeId] = candidate.figmaSource!.sourceHash;
      const ref = context.conversion.imageRefsByNode[nodeId];
      if (ref) imageRefs[nodeId] = ref;
      else delete imageRefs[nodeId];
    }
    for (const set of context.conversion.componentSets) {
      if (!set.figmaSource || selected.get(set.figmaSource.nodeId) !== 'figma') continue;
      const existing = context.document.componentSets.find((candidate) => candidate.figmaSource?.linkId === context.link.id && candidate.figmaSource.nodeId === set.figmaSource?.nodeId);
      const normalized = { ...set, id: componentSetIdMap.get(set.id) ?? set.id };
      if (existing) {
        operations.push({ kind: 'update-component-set', componentSetId: existing.id, changes: {
          name: normalized.name,
          propertyNames: normalized.propertyNames,
          order: existing.order,
          figmaSource: normalized.figmaSource,
        } });
      } else {
        operations.push({ kind: 'add-component-set', componentSet: normalized });
      }
    }
    for (const component of context.conversion.components) {
      if (!component.figmaSource || selected.get(component.figmaSource.nodeId) !== 'figma') continue;
      const existing = context.document.components.find((candidate) => candidate.figmaSource?.linkId === context.link.id && candidate.figmaSource.nodeId === component.figmaSource?.nodeId);
      const remappedProperties = component.properties.map((property) => {
        const previous = existing?.properties.find((candidate) => candidate.name === property.name && candidate.type === property.type);
        return { ...property, id: previous?.id ?? property.id, targetElementId: mappedElementId(property.targetElementId) ?? property.targetElementId };
      });
      const normalized = {
        ...component,
        id: componentIdMap.get(component.id) ?? component.id,
        rootElementId: mappedElementId(component.rootElementId) ?? component.rootElementId,
        setId: component.setId ? componentSetIdMap.get(component.setId) ?? component.setId : null,
        properties: remappedProperties,
      };
      if (existing) {
        operations.push({ kind: 'update-component', componentId: existing.id, changes: {
          name: normalized.name,
          description: normalized.description,
          setId: normalized.setId,
          variantValues: normalized.variantValues,
          properties: normalized.properties,
          key: normalized.key,
          figmaSource: normalized.figmaSource,
          updatedAt: new Date().toISOString(),
        } });
      } else {
        operations.push({ kind: 'add-component', component: normalized });
      }
    }
    const now = new Date().toISOString();
    operations.push({
      kind: 'update-figma-link',
      linkId: context.link.id,
      changes: {
        mappings,
        baselineHashes,
        localHashes,
        imageRefs,
        pendingPushNodeIds: [...pendingPushNodeIds].sort(),
        sourceVersion: context.snapshot.payload.version ?? context.link.sourceVersion,
        sourceLastModified: context.snapshot.payload.lastModified ?? context.link.sourceLastModified,
        syncedAt: now,
      },
    });
    document = await designDocumentService.apply(new ApplyDesignOperationsDto(
      dto.workspaceId,
      dto.nodeId,
      document.revision,
      operations,
      actor,
      `Synchronize Figma link ${context.link.fileName}`,
    ));
    document = await this.refreshImportedLocalHashes(document, context.link.id);
    return { document, applied: operations.length - 1 };
  }

  async acknowledgePush(workspaceId: string, nodeId: string, linkId: string, baseRevision: number, nodeIds: string[]) {
    const document = await designDocumentService.get(workspaceId, nodeId);
    if (document.revision !== baseRevision) throw new DesignRevisionConflictError(document);
    const link = document.figmaLinks.find((candidate) => candidate.id === linkId);
    if (!link) throw new Error('figma_link_not_found');
    const acknowledged = new Set(nodeIds.map(normalizeFigmaNodeId));
    const pendingPushNodeIds = link.pendingPushNodeIds.filter((candidate) => !acknowledged.has(candidate));
    return designDocumentService.apply(new ApplyDesignOperationsDto(
      workspaceId,
      nodeId,
      baseRevision,
      [{ kind: 'update-figma-link', linkId, changes: { pendingPushNodeIds, syncedAt: new Date().toISOString() } }],
      actor,
      `Acknowledge ${acknowledged.size} Figma plugin updates`,
    ));
  }

  async disconnect(workspaceId: string, nodeId: string, linkId: string, baseRevision: number) {
    return designDocumentService.apply(new ApplyDesignOperationsDto(
      workspaceId,
      nodeId,
      baseRevision,
      [{ kind: 'delete-figma-link', linkId }],
      actor,
      'Disconnect Figma file',
    ));
  }
}

export const designFigmaService = new DesignFigmaService();
