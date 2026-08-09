import { BoardColumnController } from '$lib/modules/agent-room/interface/http/controllers/BoardColumnController.js';

const ctrl = new BoardColumnController();
export const PATCH = ctrl.handle('update');
export const DELETE = ctrl.handle('destroy');
