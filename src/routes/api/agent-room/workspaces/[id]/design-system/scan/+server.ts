import { DesignCodebaseController } from '$lib/modules/agent-room/interface/http/controllers/DesignCodebaseController.js';

const controller = new DesignCodebaseController();
export const GET = controller.handle('scan');
