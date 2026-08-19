import { DesignLibraryController } from '$lib/modules/agent-room/interface/http/controllers/DesignLibraryController.js';

const controller = new DesignLibraryController();
export const GET = controller.handle('index');
export const POST = controller.handle('publish');
