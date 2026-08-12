import { WorkspaceAttachmentController } from '$lib/modules/agent-room/interface/http/controllers/WorkspaceAttachmentController.js';

const ctrl = new WorkspaceAttachmentController();
export const POST = ctrl.handle('create');
export const DELETE = ctrl.handle('destroy');
