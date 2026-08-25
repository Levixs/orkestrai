import { WorkspaceController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceController.js';

const ctrl = new WorkspaceController();
export const PATCH = ctrl.handle('moveWorkspace');
