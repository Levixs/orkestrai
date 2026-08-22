import { PresetController } from '$lib/modules/agent-room/interface/http/controllers/PresetController.js';
const controller = new PresetController();
export const GET = controller.handle('revisions');
export const POST = controller.handle('publish');
