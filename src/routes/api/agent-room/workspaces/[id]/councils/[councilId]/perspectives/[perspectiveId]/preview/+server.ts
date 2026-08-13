import { CouncilController } from '$lib/modules/agent-room/interface/http/controllers/CouncilController.js';

const controller = new CouncilController();
export const GET = controller.handle('preview');
