import { BridgeController } from '$lib/modules/agent-room/interface/http/controllers/BridgeController.js';

const ctrl = new BridgeController();
export const GET = ctrl.handle('readNote');
export const PUT = ctrl.handle('writeNote');
export const PATCH = ctrl.handle('editNote');
