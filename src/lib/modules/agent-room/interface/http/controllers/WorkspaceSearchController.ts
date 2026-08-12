import { Controller } from '@beeblock/svelar/routing';
import { WorkspaceSearchDto } from '$lib/modules/agent-room/application/dto/WorkspaceSearchDto.js';
import { workspaceSearchService } from '$lib/modules/agent-room/application/services/WorkspaceSearchService.js';
import { WorkspaceSearchRequest } from '$lib/modules/agent-room/interface/http/requests/WorkspaceSearchRequest.js';

export class WorkspaceSearchController extends Controller {
  async search(event: any) {
    try {
      const input = await WorkspaceSearchRequest.validate(event);
      return this.json({ data: await workspaceSearchService.search(WorkspaceSearchDto.from(input)) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Falha ao buscar no workspace.' }, 400);
    }
  }
}
