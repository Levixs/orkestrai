import { DesignLibraryController } from '$lib/modules/agent-room/interface/http/controllers/DesignLibraryController.js';

const controller = new DesignLibraryController();
export const POST = controller.handle('import');
export const DELETE = controller.handle('remove');
