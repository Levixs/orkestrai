import { WorkspaceSearchController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceSearchController.js';

const controller = new WorkspaceSearchController();

export const GET = controller.handle('search');
