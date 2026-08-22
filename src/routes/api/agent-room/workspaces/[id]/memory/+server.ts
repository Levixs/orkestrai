import { WorkspaceMemoryController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceMemoryController.js';

const controller = new WorkspaceMemoryController();
export const GET = controller.handle('index');
export const POST = controller.handle('store');
