import { CollaborationController } from '$lib/modules/collaboration/interface/http/controllers/CollaborationController.js';
const controller = new CollaborationController();
export const GET = controller.handle('invite');
