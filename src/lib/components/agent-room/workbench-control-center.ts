import type { CanvasNode, Workspace } from '$lib/modules/agent-room/domain/types.js';

const CONTROL_CENTER_PREFIX = 'workbench-control-center:';

export function workbenchControlCenterItemId(workspaceId: string): string {
  return `${CONTROL_CENTER_PREFIX}${workspaceId}`;
}

export function isWorkbenchControlCenterItemId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(CONTROL_CENTER_PREFIX));
}

export function createWorkbenchControlCenterItem(workspace: Workspace, title: string): CanvasNode {
  const now = new Date().toISOString();
  return {
    id: workbenchControlCenterItemId(workspace.id),
    workspaceId: workspace.id,
    type: 'controlCenter',
    title,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    zIndex: 0,
    payload: { workbenchControlCenter: true },
    floorId: null,
    createdAt: now,
    updatedAt: now,
  };
}
