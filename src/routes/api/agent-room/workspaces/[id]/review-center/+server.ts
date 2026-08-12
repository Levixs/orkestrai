import { ReviewCenterController } from '$lib/modules/agent-room/interface/http/controllers/ReviewCenterController.js';

const ctrl = new ReviewCenterController();
export const GET = ctrl.handle('index');
export const POST = ctrl.handle('store');
