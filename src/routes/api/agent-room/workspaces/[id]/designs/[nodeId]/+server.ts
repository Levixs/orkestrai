import { DesignDocumentController } from '$lib/modules/agent-room/interface/http/controllers/DesignDocumentController.js';

const controller = new DesignDocumentController();

export const GET = controller.handle('show');
export const PATCH = controller.handle('apply');
