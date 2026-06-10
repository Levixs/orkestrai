import { AdminController } from '$lib/modules/admin/interface/http/controllers/AdminController.js';

const ctrl = new AdminController();
export const GET = ctrl.handle('listUsers');
export const PUT = ctrl.handle('updateUserRole');
export const DELETE = ctrl.handle('deleteUser');
