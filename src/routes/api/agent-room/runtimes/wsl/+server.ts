import { WorkspaceRuntimeController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceRuntimeController.js';

const controller = new WorkspaceRuntimeController();
export const GET = controller.handle('wsl');
