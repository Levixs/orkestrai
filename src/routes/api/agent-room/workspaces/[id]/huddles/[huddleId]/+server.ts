import { HuddleController } from '$lib/modules/agent-room/interface/http/controllers/HuddleController.js';

const controller = new HuddleController();
export const GET = controller.handle('show');
export const PATCH = controller.handle('update');
