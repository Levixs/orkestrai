import { AutomationController } from '$lib/modules/agent-room/interface/http/controllers/AutomationController.js';
const ctrl = new AutomationController();
export const POST = ctrl.handle('retry');
