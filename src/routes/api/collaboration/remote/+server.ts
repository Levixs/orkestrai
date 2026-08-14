import { RemoteCollaborationController } from '$lib/modules/collaboration/interface/http/controllers/RemoteCollaborationController.js';

const controller = new RemoteCollaborationController();
export const GET = controller.handle('status');
export const POST = controller.handle('join');
export const DELETE = controller.handle('leave');
