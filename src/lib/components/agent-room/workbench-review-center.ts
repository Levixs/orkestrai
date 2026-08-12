import type { CanvasNode, Workspace } from '$lib/modules/agent-room/domain/types.js';

const REVIEW_CENTER_PREFIX = 'workbench-review-center:';

export function workbenchReviewCenterItemId(workspaceId: string): string {
  return `${REVIEW_CENTER_PREFIX}${workspaceId}`;
}

export function isWorkbenchReviewCenterItemId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(REVIEW_CENTER_PREFIX));
}

export function createWorkbenchReviewCenterItem(workspace: Workspace, title: string): CanvasNode {
  const now = new Date().toISOString();
  return {
    id: workbenchReviewCenterItemId(workspace.id),
    workspaceId: workspace.id,
    type: 'reviewCenter',
    title,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    zIndex: 0,
    payload: { workbenchReviewCenter: true },
    floorId: null,
    createdAt: now,
    updatedAt: now,
  };
}
