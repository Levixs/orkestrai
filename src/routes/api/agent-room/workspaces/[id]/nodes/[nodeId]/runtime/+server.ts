import { WorkspaceController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceController.js';

const controller = new WorkspaceController();
export const PUT = controller.handle('changeTerminalRuntime');
