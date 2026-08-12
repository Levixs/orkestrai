import type { CanvasNode, Workspace } from '$lib/modules/agent-room/domain/types.js';

const WORKBENCH_FILE_PREFIX = 'workbench-file:';

export function workbenchFileItemId(path: string): string {
  return `${WORKBENCH_FILE_PREFIX}${encodeURIComponent(path)}`;
}

export function isWorkbenchFileItemId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(WORKBENCH_FILE_PREFIX));
}

export function pathFromWorkbenchFileItemId(id: string | null | undefined): string | null {
  if (!isWorkbenchFileItemId(id)) return null;
  try {
    return decodeURIComponent(String(id).slice(WORKBENCH_FILE_PREFIX.length));
  } catch {
    return null;
  }
}

export function workbenchFilePathsFromLayout(raw: unknown): string[] {
  const paths = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.nodeIds)) {
      for (const id of record.nodeIds) {
        const path = typeof id === 'string' ? pathFromWorkbenchFileItemId(id) : null;
        if (path) paths.add(path);
      }
    }
    if (Array.isArray(record.children)) record.children.forEach(visit);
    if (Array.isArray(record.panes)) record.panes.forEach(visit);
    if (record.root) visit(record.root);
  };
  visit(raw);
  return [...paths];
}

export function createWorkbenchFileItem(workspace: Workspace, path: string): CanvasNode {
  const now = new Date().toISOString();
  return {
    id: workbenchFileItemId(path),
    workspaceId: workspace.id,
    type: 'editor',
    title: path.split(/[\\/]/).filter(Boolean).at(-1) ?? path,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    zIndex: 0,
    payload: { path, workbenchFile: true },
    floorId: null,
    createdAt: now,
    updatedAt: now,
  };
}
