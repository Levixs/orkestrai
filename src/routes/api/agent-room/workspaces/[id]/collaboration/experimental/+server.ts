import { CollaborationController } from '$lib/modules/collaboration/interface/http/controllers/CollaborationController.js';
const controller = new CollaborationController();
export const PATCH = controller.handle('setExperimental');
