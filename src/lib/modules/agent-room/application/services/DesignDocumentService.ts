import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { uuidv7 } from '@beeblock/svelar/support';
import {
  designDocumentSchema,
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
      continue;
    }
    if (operation.kind === 'reorder') {
      const target = next.elements.find((element) => element.id === operation.elementId);
      if (!target) throw new Error('Design element not found.');
      if (target.locked) throw new Error('Design element is locked.');
      target.order = operation.order;
      continue;
    }
    if (operation.kind === 'set-active-page') {
      if (!next.pages.some((page) => page.id === operation.pageId)) throw new Error('Design page not found.');
      next.activePageId = operation.pageId;
      continue;
    }
    if (operation.kind === 'rename-document') next.name = operation.name;
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
      directory,
      path: join(directory, `${nodeId}.orkestrai-design.json`),
      historyPath: join(directory, `${nodeId}.history.jsonl`),
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
      return validated;
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

  async remove(workspaceId: string, nodeId: string): Promise<void> {
    await this.serialized(workspaceId, nodeId, async () => {
      const context = await this.context(workspaceId, nodeId);
      await Promise.all([
        rm(context.path, { force: true }),
        rm(context.historyPath, { force: true }),
      ]);
    });
  }
}

export const designDocumentService = new DesignDocumentService();
