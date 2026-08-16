import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { uuidv7 } from '@beeblock/svelar/support';
import {
  designDocumentSchema,
  type DesignAsset,
  type DesignDocument,
  type DesignElement,
  type DesignOperation,
} from '../../contracts/schemas/designSchemas.js';
import type { ApplyDesignOperationsDto } from '../dto/DesignDtos.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';

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
        if (parent.type !== 'frame') throw new Error('Only frames can contain design elements.');
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
      if (next.elements[index].locked) {
        const onlyLockChange = Object.keys(operation.changes).every((key) => key === 'locked');
        if (!onlyLockChange) throw new Error('Design element is locked.');
      }
      next.elements[index] = { ...next.elements[index], ...operation.changes };
      continue;
    }
    if (operation.kind === 'delete') {
      const target = next.elements.find((element) => element.id === operation.elementId);
      if (!target) throw new Error('Design element not found.');
      if (target.locked) throw new Error('Design element is locked.');
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
      target.order = operation.order;
      continue;
    }
    if (operation.kind === 'reparent') {
      const target = next.elements.find((element) => element.id === operation.elementId);
      if (!target) throw new Error('Design element not found.');
      if (target.locked) throw new Error('Design element is locked.');
      if (operation.parentId) {
        const parent = next.elements.find((element) => element.id === operation.parentId);
        if (!parent || parent.type !== 'frame' || parent.pageId !== target.pageId) throw new Error('Invalid design parent.');
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
