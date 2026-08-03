import { WorkspaceController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceController.js';

const ctrl = new WorkspaceController();
export const GET = ctrl.handle('getWorkspace');
export const PATCH = ctrl.handle('updateWorkspace');
export const DELETE = ctrl.handle('deleteWorkspace');
