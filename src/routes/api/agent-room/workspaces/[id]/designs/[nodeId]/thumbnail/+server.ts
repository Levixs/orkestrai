import { DesignDocumentController } from '$lib/modules/agent-room/interface/http/controllers/DesignDocumentController.js';

const controller = new DesignDocumentController();

export const GET = controller.handle('thumbnail');
export const POST = controller.handle('uploadThumbnail');
