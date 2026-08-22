import type { CanvasNode, Workspace } from '$lib/modules/agent-room/domain/types.js';

const MEMORY_PREFIX = 'workbench-memory:';

export function workbenchMemoryItemId(workspaceId: string): string {
  return `${MEMORY_PREFIX}${workspaceId}`;
}

export function isWorkbenchMemoryItemId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(MEMORY_PREFIX));
}

export function createWorkbenchMemoryItem(workspace: Workspace, title: string): CanvasNode {
  const now = new Date().toISOString();
  return {
    id: workbenchMemoryItemId(workspace.id),
    workspaceId: workspace.id,
    type: 'memory',
    title,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    zIndex: 0,
    payload: { workbenchMemory: true },
    floorId: null,
    createdAt: now,
    updatedAt: now,
  };
}
