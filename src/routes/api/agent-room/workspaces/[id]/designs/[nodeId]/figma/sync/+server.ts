import { DesignFigmaController } from '$lib/modules/agent-room/interface/http/controllers/DesignFigmaController.js';

const controller = new DesignFigmaController();
export const POST = controller.handle('preview');
export const PATCH = controller.handle('apply');
