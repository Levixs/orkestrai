import { WorkspaceController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceController.js';

const ctrl = new WorkspaceController();
export const GET = ctrl.handle('listEdges');
export const POST = ctrl.handle('createEdge');
