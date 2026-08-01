import { FloorController } from '$lib/modules/agent-room/interface/http/controllers/FloorController.js';

const ctrl = new FloorController();
export const POST = ctrl.handle('landFloor');
