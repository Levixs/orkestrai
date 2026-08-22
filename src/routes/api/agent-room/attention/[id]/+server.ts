import { AttentionController } from '$lib/modules/agent-room/interface/http/controllers/AttentionController.js';

const controller = new AttentionController();
export const PATCH = controller.handle('update');
