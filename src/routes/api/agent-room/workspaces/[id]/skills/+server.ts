import { SkillMarketController } from '$lib/modules/agent-room/interface/http/controllers/SkillMarketController.js';

const ctrl = new SkillMarketController();
export const GET = ctrl.handle('listInstalled');
export const POST = ctrl.handle('install');
