import { WorkspaceController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceController.js';

const ctrl = new WorkspaceController();
export const GET = ctrl.handle('listWorkspaces');
export const POST = ctrl.handle('createWorkspace');
