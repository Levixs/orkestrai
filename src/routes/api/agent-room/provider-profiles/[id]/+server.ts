import { ProviderProfileController } from '$lib/modules/agent-room/interface/http/controllers/ProviderProfileController.js';

const ctrl = new ProviderProfileController();
export const PATCH = ctrl.handle('update');
export const DELETE = ctrl.handle('remove');
