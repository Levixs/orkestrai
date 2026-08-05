import { PresetController } from '$lib/modules/agent-room/interface/http/controllers/PresetController.js';

const ctrl = new PresetController();
export const DELETE = ctrl.handle('remove');
