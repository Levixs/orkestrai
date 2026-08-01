import { TaskBoardController } from '$lib/modules/agent-room/interface/http/controllers/TaskBoardController.js';

const ctrl = new TaskBoardController();
export const GET = ctrl.handle('listTasks');
export const POST = ctrl.handle('createTask');
