import { WorkspaceGroupController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceGroupController.js';

const ctrl = new WorkspaceGroupController();
export const GET = ctrl.handle('list');
export const POST = ctrl.handle('create');
