import { PresetController } from '$lib/modules/agent-room/interface/http/controllers/PresetController.js';

const ctrl = new PresetController();
export const POST = ctrl.handle('apply');
