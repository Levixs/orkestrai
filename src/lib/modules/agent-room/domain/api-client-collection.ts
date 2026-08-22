import type { ApiClientFolder, ApiClientRequest, ApiClientRunner } from './types.js';

export type ApiClientTreeRow =
  | { kind: 'folder'; id: string; depth: number; folder: ApiClientFolder }
  | { kind: 'request'; id: string; depth: number; request: ApiClientRequest };

function stableFolderId(path: string): string {
  let hash = 2166136261;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `folder-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function migrateApiClientFolders(
  requests: ApiClientRequest[],
  persistedFolders: ApiClientFolder[] = [],
): { requests: ApiClientRequest[]; folders: ApiClientFolder[]; migrated: boolean } {
  const folders = persistedFolders.map((folder, sequence) => ({
    ...folder,
    parentId: folder.parentId ?? null,
    sequence: folder.sequence ?? sequence,
  }));
  const folderIds = new Set(folders.map((folder) => folder.id));
  const byPath = new Map<string, ApiClientFolder>();

  const pathFor = (folder: ApiClientFolder): string => {
    const parts = [folder.name];
    let parent = folders.find((candidate) => candidate.id === folder.parentId);
    const visited = new Set([folder.id]);
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      parts.unshift(parent.name);
      parent = folders.find((candidate) => candidate.id === parent?.parentId);
    }
    return parts.join(' / ');
  };
  for (const folder of folders) byPath.set(pathFor(folder), folder);

  let migrated = false;
  const nextRequests = requests.map((request) => {
    if (request.folderId && folderIds.has(request.folderId)) return request;
    const parts = (request.folder ?? '').split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return request.folderId === null ? request : { ...request, folderId: null };
    let parentId: string | null = null;
    let path = '';
    for (const part of parts) {
      path = path ? `${path} / ${part}` : part;
      let folder = byPath.get(path);
      if (!folder) {
        folder = { id: stableFolderId(path), name: part, parentId, sequence: folders.length };
        folders.push(folder);
        folderIds.add(folder.id);
        byPath.set(path, folder);
        migrated = true;
      }
      parentId = folder.id;
    }
    migrated = true;
    return { ...request, folderId: parentId };
  });
  return { requests: nextRequests, folders, migrated };
}

export function apiClientFolderPath(folders: ApiClientFolder[], folderId: string | null | undefined): string {
  if (!folderId) return '';
  const parts: string[] = [];
  const visited = new Set<string>();
  let folder = folders.find((candidate) => candidate.id === folderId);
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id);
    parts.unshift(folder.name);
    folder = folders.find((candidate) => candidate.id === folder?.parentId);
  }
  return parts.join(' / ');
}

export function apiClientDescendantFolderIds(folders: ApiClientFolder[], folderId: string): Set<string> {
  const result = new Set<string>([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) {
        result.add(folder.id);
        changed = true;
      }
    }
  }
  return result;
}

export function apiClientTreeRows(
  folders: ApiClientFolder[],
  requests: ApiClientRequest[],
  collapsedFolderIds: Set<string> = new Set(),
): ApiClientTreeRow[] {
  const rows: ApiClientTreeRow[] = [];
  const orderedFolders = [...folders].sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
  const orderedRequests = [...requests].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const visit = (parentId: string | null, depth: number) => {
    for (const folder of orderedFolders.filter((candidate) => candidate.parentId === parentId)) {
      rows.push({ kind: 'folder', id: folder.id, folder, depth });
      if (!collapsedFolderIds.has(folder.id)) visit(folder.id, depth + 1);
    }
    for (const request of orderedRequests.filter((candidate) => (candidate.folderId ?? null) === parentId)) {
      rows.push({ kind: 'request', id: request.id, request, depth });
    }
  };
  visit(null, 0);
  return rows;
}

export function normalizeApiClientRunners(runners: ApiClientRunner[] | undefined, requestIds: string[]): ApiClientRunner[] {
  const existingIds = new Set(requestIds);
  return (runners ?? []).map((runner, sequence) => ({
    ...runner,
    requestIds: runner.requestIds.filter((id) => existingIds.has(id)),
    environment: runner.environment ?? null,
    iterations: Math.max(1, Math.min(1_000, runner.iterations || 1)),
    iterationData: Array.isArray(runner.iterationData) ? runner.iterationData.slice(0, 1_000) : [],
    delayMs: Math.max(0, Math.min(60_000, runner.delayMs || 0)),
    stopOnFailure: runner.stopOnFailure === true,
    sequence: runner.sequence ?? sequence,
  }));
}
