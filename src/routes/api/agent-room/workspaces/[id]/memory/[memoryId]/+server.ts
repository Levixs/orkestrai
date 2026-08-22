import { WorkspaceMemoryController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceMemoryController.js';

const controller = new WorkspaceMemoryController();
export const PATCH = controller.handle('update');
export const DELETE = controller.handle('destroy');
