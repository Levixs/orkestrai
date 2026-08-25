import { WorkspaceGroupController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceGroupController.js';

const ctrl = new WorkspaceGroupController();
export const PATCH = ctrl.handle('update');
export const DELETE = ctrl.handle('remove');
