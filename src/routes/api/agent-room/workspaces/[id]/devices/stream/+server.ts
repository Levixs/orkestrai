import { DeviceController } from '$lib/modules/agent-room/interface/http/controllers/DeviceController.js';

const controller = new DeviceController();
export const GET = controller.handle('stream');
