import { TaskBoardController } from '$lib/modules/agent-room/interface/http/controllers/TaskBoardController.js';

const ctrl = new TaskBoardController();
export const GET = ctrl.handle('historyTasks');
