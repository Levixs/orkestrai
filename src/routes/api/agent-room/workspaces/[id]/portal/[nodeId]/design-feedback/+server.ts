import { PortalDesignFeedbackController } from '$lib/modules/agent-room/interface/http/controllers/PortalDesignFeedbackController.js';

const ctrl = new PortalDesignFeedbackController();
export const POST = ctrl.handle('send');
