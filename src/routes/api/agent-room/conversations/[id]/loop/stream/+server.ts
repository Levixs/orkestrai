import { AgentRoomController } from '$lib/modules/agent-room/interface/http/controllers/AgentRoomController.js';

const ctrl = new AgentRoomController();
export const POST = ctrl.handle('streamLoop');
