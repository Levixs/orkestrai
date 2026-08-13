import { CouncilController } from '$lib/modules/agent-room/interface/http/controllers/CouncilController.js';

const controller = new CouncilController();
export const GET = controller.handle('show');
export const PATCH = controller.handle('decide');
