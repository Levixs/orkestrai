import { FloorController } from '$lib/modules/agent-room/interface/http/controllers/FloorController.js';

const ctrl = new FloorController();
export const GET = ctrl.handle('getHooks');
export const PUT = ctrl.handle('saveHooks');
