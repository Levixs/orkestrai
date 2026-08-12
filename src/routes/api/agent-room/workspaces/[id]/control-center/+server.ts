import { ControlCenterController } from '$lib/modules/agent-room/interface/http/controllers/ControlCenterController.js';

const ctrl = new ControlCenterController();
export const GET = ctrl.handle('show');
