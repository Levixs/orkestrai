import { AuthController } from '$lib/modules/auth/interface/http/controllers/AuthController.js';

const ctrl = new AuthController();
export const GET = ctrl.handle('verifyEmail');
