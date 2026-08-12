import { ReviewCenterController } from '$lib/modules/agent-room/interface/http/controllers/ReviewCenterController.js';

const ctrl = new ReviewCenterController();
export const POST = ctrl.handle('comment');
