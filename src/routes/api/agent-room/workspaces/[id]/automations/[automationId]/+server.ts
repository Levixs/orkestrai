import { AutomationController } from '$lib/modules/agent-room/interface/http/controllers/AutomationController.js';
const ctrl = new AutomationController();
export const PUT = ctrl.handle('update');
export const PATCH = ctrl.handle('enabled');
export const DELETE = ctrl.handle('remove');
