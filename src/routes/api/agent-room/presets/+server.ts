import { PresetController } from '$lib/modules/agent-room/interface/http/controllers/PresetController.js';

const ctrl = new PresetController();
export const GET = ctrl.handle('list');
export const POST = ctrl.handle('create');
