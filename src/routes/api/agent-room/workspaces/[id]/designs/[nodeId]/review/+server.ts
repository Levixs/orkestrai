import { DesignReviewController } from '$lib/modules/agent-room/interface/http/controllers/DesignReviewController.js';

const controller = new DesignReviewController();

export const POST = controller.handle('store');
