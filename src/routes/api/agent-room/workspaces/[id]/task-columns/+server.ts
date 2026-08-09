import { BoardColumnController } from '$lib/modules/agent-room/interface/http/controllers/BoardColumnController.js';

const ctrl = new BoardColumnController();
export const GET = ctrl.handle('index');
export const POST = ctrl.handle('store');
