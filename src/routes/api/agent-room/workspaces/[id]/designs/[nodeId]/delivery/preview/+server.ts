import { DesignDeliveryController } from '$lib/modules/agent-room/interface/http/controllers/DesignDeliveryController.js';

const controller = new DesignDeliveryController();
export const POST = controller.handle('preview');
