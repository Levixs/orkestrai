import { TaskBoardController } from '$lib/modules/agent-room/interface/http/controllers/TaskBoardController.js';

const ctrl = new TaskBoardController();
export const POST = ctrl.handle('attachImage');
export const DELETE = ctrl.handle('detachImage');
