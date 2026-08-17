import { DesignExplorationController } from '$lib/modules/agent-room/interface/http/controllers/DesignExplorationController.js';

const controller = new DesignExplorationController();
export const POST = controller.handle('store');
