import { DesignFigmaController } from '$lib/modules/agent-room/interface/http/controllers/DesignFigmaController.js';

const controller = new DesignFigmaController();
export const GET = controller.handle('pluginConnection');
