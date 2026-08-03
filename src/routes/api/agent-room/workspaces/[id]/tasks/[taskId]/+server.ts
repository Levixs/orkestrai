import { TaskBoardController } from '$lib/modules/agent-room/interface/http/controllers/TaskBoardController.js';

const ctrl = new TaskBoardController();
export const PATCH = ctrl.handle('updateTask');
export const DELETE = ctrl.handle('removeTask');
