import { ApiClientController } from '$lib/modules/agent-room/interface/http/controllers/ApiClientController.js';

const controller = new ApiClientController();
export const POST = controller.handle('execute');
