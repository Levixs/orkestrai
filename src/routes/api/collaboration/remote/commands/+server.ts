import { RemoteCollaborationController } from '$lib/modules/collaboration/interface/http/controllers/RemoteCollaborationController.js';

const controller = new RemoteCollaborationController();
export const POST = controller.handle('command');
