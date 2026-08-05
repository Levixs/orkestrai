import { McpController } from '$lib/modules/agent-room/interface/http/controllers/McpController.js';

const ctrl = new McpController();
export const GET = ctrl.handle('list');
export const POST = ctrl.handle('add');
export const DELETE = ctrl.handle('remove');
