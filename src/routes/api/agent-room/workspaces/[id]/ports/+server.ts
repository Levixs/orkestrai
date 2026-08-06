import { PortController } from '$lib/modules/agent-room/interface/http/controllers/PortController.js';

const ctrl = new PortController();
export const GET = ctrl.handle('index');
export const DELETE = ctrl.handle('destroy');
