import { FloorController } from '$lib/modules/agent-room/interface/http/controllers/FloorController.js';

const ctrl = new FloorController();
export const GET = ctrl.handle('listFloors');
export const POST = ctrl.handle('createFloor');
