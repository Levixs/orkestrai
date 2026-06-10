import { AuthController } from '$lib/modules/auth/interface/http/controllers/AuthController.js';

const ctrl = new AuthController();
export const POST = ctrl.handle('logout');
