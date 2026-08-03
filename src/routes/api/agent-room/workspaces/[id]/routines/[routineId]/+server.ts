import { RoutineController } from '$lib/modules/agent-room/interface/http/controllers/FloorController.js';

const ctrl = new RoutineController();
export const PUT = ctrl.handle('updateRoutine');
export const PATCH = ctrl.handle('setEnabled');
export const DELETE = ctrl.handle('removeRoutine');
