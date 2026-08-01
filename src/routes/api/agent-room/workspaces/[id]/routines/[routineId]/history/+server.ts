import { RoutineController } from '$lib/modules/agent-room/interface/http/controllers/FloorController.js';

const ctrl = new RoutineController();
export const GET = ctrl.handle('history');
