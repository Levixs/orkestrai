import type { CanvasNode, Workspace } from '$lib/modules/agent-room/domain/types.js';

const DEVICE_PREFIX = 'workbench-device:';

export function workbenchDeviceItemId(workspaceId: string): string {
  return `${DEVICE_PREFIX}${workspaceId}`;
}

export function isWorkbenchDeviceItemId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(DEVICE_PREFIX));
}

export function createWorkbenchDeviceItem(workspace: Workspace, title: string): CanvasNode {
  return {
    id: workbenchDeviceItemId(workspace.id),
    workspaceId: workspace.id,
    type: 'device',
    title,
    x: 0,
    y: 0,
    width: 420,
    height: 720,
    zIndex: 0,
    floorId: null,
    payload: { workbenchDevice: true },
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}
