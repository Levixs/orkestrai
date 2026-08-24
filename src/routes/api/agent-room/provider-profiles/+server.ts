import { ProviderProfileController } from '$lib/modules/agent-room/interface/http/controllers/ProviderProfileController.js';

const ctrl = new ProviderProfileController();
export const GET = ctrl.handle('list');
export const POST = ctrl.handle('create');
