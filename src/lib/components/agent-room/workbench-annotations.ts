import type { CanvasNode, Workspace } from '$lib/modules/agent-room/domain/types.js';

const PREFIX = 'workbench-annotations:';
export const workbenchAnnotationsItemId = (workspaceId: string) => `${PREFIX}${workspaceId}`;
export const isWorkbenchAnnotationsItemId = (id: string | null | undefined) => Boolean(id?.startsWith(PREFIX));
export function createWorkbenchAnnotationsItem(workspace: Workspace, title: string): CanvasNode {
  const now = new Date().toISOString();
  return { id: workbenchAnnotationsItemId(workspace.id), workspaceId: workspace.id, type: 'annotations', title, x: 0, y: 0, width: 0, height: 0, zIndex: 0, payload: { workbenchAnnotations: true }, floorId: null, createdAt: now, updatedAt: now };
}
