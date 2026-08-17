import { DesignCollaborationController } from '$lib/modules/agent-room/interface/http/controllers/DesignCollaborationController.js';

const controller = new DesignCollaborationController();

export const GET = controller.handle('show');
export const PUT = controller.handle('heartbeat');
export const DELETE = controller.handle('leave');
