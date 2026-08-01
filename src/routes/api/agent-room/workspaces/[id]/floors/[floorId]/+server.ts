import { FloorController } from '$lib/modules/agent-room/interface/http/controllers/FloorController.js';

const ctrl = new FloorController();
export const PATCH = ctrl.handle('renameFloor');
export const DELETE = ctrl.handle('removeFloor');
