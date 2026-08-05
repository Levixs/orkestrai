import { McpMarketController } from '$lib/modules/agent-room/interface/http/controllers/McpMarketController.js';

const ctrl = new McpMarketController();
export const GET = ctrl.handle('search');
export const POST = ctrl.handle('install');
