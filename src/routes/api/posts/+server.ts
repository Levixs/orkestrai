import { PostController } from '$lib/modules/posts/interface/http/controllers/PostController.js';

const ctrl = new PostController();
export const GET = ctrl.handle('index');
export const POST = ctrl.handle('store');
