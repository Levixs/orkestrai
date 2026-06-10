import { AdminController } from '$lib/modules/admin/interface/http/controllers/AdminController.js';

const ctrl = new AdminController();
export const POST = ctrl.handle('createRole');
export const DELETE = ctrl.handle('deleteRole');
