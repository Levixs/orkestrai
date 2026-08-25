import { Controller } from '@beeblock/svelar/routing';
import { CreateWorkspaceGroupDto, UpdateWorkspaceGroupDto } from '$lib/modules/agent-room/application/dto/WorkspaceGroupDto.js';
import { WorkspaceGroupError, workspaceGroupService } from '$lib/modules/agent-room/application/services/WorkspaceGroupService.js';
import { CreateWorkspaceGroupRequest, UpdateWorkspaceGroupRequest } from '$lib/modules/agent-room/interface/http/requests/WorkspaceGroupRequests.js';

/** Pastas para organizar workspaces na barra lateral — globais, nao por workspace. */
export class WorkspaceGroupController extends Controller {
  async list() {
    return this.json({ data: await workspaceGroupService.list() });
  }

  async create(event: any) {
    try {
      const input = await CreateWorkspaceGroupRequest.validate(event);
      return this.json({ data: await workspaceGroupService.create(CreateWorkspaceGroupDto.from(input)) }, 201);
    } catch (error) {
      return this.errorResponse(error, 'group_save_failed');
    }
  }

  async update(event: any) {
    try {
      const input = await UpdateWorkspaceGroupRequest.validate(event);
      const dto = UpdateWorkspaceGroupDto.from(input);
      return this.json({ data: await workspaceGroupService.update(event.params.id, dto) });
    } catch (error) {
      return this.errorResponse(error, 'group_save_failed');
    }
  }

  async remove(event: any) {
    try {
      return this.json({ data: await workspaceGroupService.remove(event.params.id) });
    } catch (error) {
      return this.errorResponse(error, 'group_delete_failed');
    }
  }

  private errorResponse(error: unknown, fallback: string, status = 400) {
    return this.json({
      error: error instanceof WorkspaceGroupError ? error.code : fallback,
    }, status);
  }
}
