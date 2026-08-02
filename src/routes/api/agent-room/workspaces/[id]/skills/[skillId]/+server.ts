import { SkillMarketController } from '$lib/modules/agent-room/interface/http/controllers/SkillMarketController.js';

const ctrl = new SkillMarketController();
export const DELETE = ctrl.handle('uninstall');
