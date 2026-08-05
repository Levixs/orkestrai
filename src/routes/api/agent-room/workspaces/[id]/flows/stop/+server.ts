import { FlowController } from '$lib/modules/agent-room/interface/http/controllers/FlowController.js';

const ctrl = new FlowController();
export const POST = ctrl.handle('stop');
