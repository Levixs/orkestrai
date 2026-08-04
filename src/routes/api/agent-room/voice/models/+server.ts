import { VoiceController } from '$lib/modules/agent-room/interface/http/controllers/VoiceController.js';

const ctrl = new VoiceController();
export const POST = ctrl.handle('downloadModels');
export const GET = ctrl.handle('modelsStatus');
export const DELETE = ctrl.handle('deleteModels');
