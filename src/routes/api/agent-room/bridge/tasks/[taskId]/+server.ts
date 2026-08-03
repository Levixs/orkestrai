import { BridgeController } from '$lib/modules/agent-room/interface/http/controllers/BridgeController.js';

const ctrl = new BridgeController();
export const PATCH = ctrl.handle('taskUpdate');
