import type { CanvasNode, Workspace } from '$lib/modules/agent-room/domain/types.js';

const PREFIX = 'workbench-huddles:';
export const workbenchHuddlesItemId = (workspaceId: string) => `${PREFIX}${workspaceId}`;
export const isWorkbenchHuddlesItemId = (id: string | null | undefined) => Boolean(id?.startsWith(PREFIX));
export function createWorkbenchHuddlesItem(workspace: Workspace, title: string): CanvasNode {
  const now = new Date().toISOString();
  return {
    id: workbenchHuddlesItemId(workspace.id),
    workspaceId: workspace.id,
    type: 'huddles',
    title,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    zIndex: 0,
    payload: { workbenchHuddles: true },
    floorId: null,
    createdAt: now,
    updatedAt: now,
  };
}
