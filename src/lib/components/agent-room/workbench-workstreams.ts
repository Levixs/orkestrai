import type { CanvasNode, Workspace } from '$lib/modules/agent-room/domain/types.js';

const WORKSTREAMS_PREFIX = 'workbench-workstreams:';

export function workbenchWorkstreamsItemId(workspaceId: string): string {
  return `${WORKSTREAMS_PREFIX}${workspaceId}`;
}

export function isWorkbenchWorkstreamsItemId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(WORKSTREAMS_PREFIX));
}

export function createWorkbenchWorkstreamsItem(workspace: Workspace, title: string): CanvasNode {
  const now = new Date().toISOString();
  return {
    id: workbenchWorkstreamsItemId(workspace.id),
    workspaceId: workspace.id,
    type: 'workstreams',
    title,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    zIndex: 0,
    payload: { workbenchWorkstreams: true },
    floorId: null,
    createdAt: now,
    updatedAt: now,
  };
}
