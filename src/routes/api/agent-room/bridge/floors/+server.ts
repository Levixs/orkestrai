import { BridgeController } from '$lib/modules/agent-room/interface/http/controllers/BridgeController.js';

const ctrl = new BridgeController();
export const GET = ctrl.handle('floorList');
export const POST = ctrl.handle('floorCreate');
