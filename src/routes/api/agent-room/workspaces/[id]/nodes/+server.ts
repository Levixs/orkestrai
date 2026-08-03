import { WorkspaceController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceController.js';

const ctrl = new WorkspaceController();
export const GET = ctrl.handle('listNodes');
export const POST = ctrl.handle('createNode');
