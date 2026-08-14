import { CollaborationController } from '$lib/modules/collaboration/interface/http/controllers/CollaborationController.js';
const controller = new CollaborationController();
export const DELETE = controller.handle('stopShare');
