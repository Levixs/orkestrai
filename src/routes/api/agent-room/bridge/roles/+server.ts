import { BridgeController } from '$lib/modules/agent-room/interface/http/controllers/BridgeController.js';

const ctrl = new BridgeController();
export const GET = ctrl.handle('roleShow');
export const POST = ctrl.handle('roleWrite');
export const PATCH = ctrl.handle('roleEdit');
