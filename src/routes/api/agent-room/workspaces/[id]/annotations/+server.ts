import { AnnotationCenterController } from '$lib/modules/agent-room/interface/http/controllers/AnnotationCenterController.js';

const controller = new AnnotationCenterController();
export const GET = controller.handle('index');
