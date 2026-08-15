import { Controller } from '@beeblock/svelar/routing';
import { workspaceRuntimeService } from '../../../application/services/WorkspaceRuntimeService.js';

export class WorkspaceRuntimeController extends Controller {
  async wsl(event: any) {
    const path = event.url.searchParams.get('path');
    return this.json({ data: await workspaceRuntimeService.wslAvailability(path) });
  }
}
