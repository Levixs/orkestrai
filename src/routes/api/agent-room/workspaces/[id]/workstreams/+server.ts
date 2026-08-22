import { WorkstreamController } from '$lib/modules/agent-room/interface/http/controllers/WorkstreamController.js';

const controller = new WorkstreamController();
export const GET = controller.handle('index');
