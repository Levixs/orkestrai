import type { CanvasNode, Workspace } from '$lib/modules/agent-room/domain/types.js';

const AUTOMATIONS_PREFIX = 'workbench-automations:';

export function workbenchAutomationsItemId(workspaceId: string): string {
  return `${AUTOMATIONS_PREFIX}${workspaceId}`;
}

export function isWorkbenchAutomationsItemId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(AUTOMATIONS_PREFIX));
}

export function createWorkbenchAutomationsItem(workspace: Workspace, title: string): CanvasNode {
  const now = new Date().toISOString();
  return {
    id: workbenchAutomationsItemId(workspace.id), workspaceId: workspace.id, type: 'automation', title,
    x: 0, y: 0, width: 0, height: 0, zIndex: 0, payload: { workbenchAutomations: true },
    floorId: null, createdAt: now, updatedAt: now,
  };
}
