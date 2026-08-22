import { Controller, type RequestEvent } from '@beeblock/svelar/routing';
import { annotationCenterService } from '../../../application/services/AnnotationCenterService.js';

export class AnnotationCenterController extends Controller {
  async index(event: RequestEvent) {
    try {
      return this.json({ data: await annotationCenterService.snapshot(event.params.id) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Could not load annotations.' }, 400);
    }
  }
}
