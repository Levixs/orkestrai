import { Controller, type RequestEvent } from '@beeblock/svelar/routing';
import { SaveWorkspaceMemoryDto, ReviseWorkspaceMemoryDto, ArchiveWorkspaceMemoryDto } from '../../../application/dto/WorkspaceMemoryDto.js';
import { saveWorkspaceMemoryAction } from '../../../application/actions/SaveWorkspaceMemoryAction.js';
import { reviseWorkspaceMemoryAction } from '../../../application/actions/ReviseWorkspaceMemoryAction.js';
import { archiveWorkspaceMemoryAction } from '../../../application/actions/ArchiveWorkspaceMemoryAction.js';
import { workspaceMemoryService, WorkspaceMemoryConflictError } from '../../../application/services/WorkspaceMemoryService.js';
import { SaveWorkspaceMemoryRequest } from '../requests/SaveWorkspaceMemoryRequest.js';
import { ReviseWorkspaceMemoryRequest } from '../requests/ReviseWorkspaceMemoryRequest.js';

export class WorkspaceMemoryController extends Controller {
  async index(event: RequestEvent) {
    try {
      return this.json({ data: await workspaceMemoryService.list(event.params.id, {
        query: event.url.searchParams.get('q') ?? '',
        includeHistory: event.url.searchParams.get('history') === '1',
        limit: Number(event.url.searchParams.get('limit') ?? 200),
      }) });
    } catch (error) {
      return this.failure(error, 'Could not load workspace memory.');
    }
  }

  async store(event: RequestEvent) {
    try {
      const input = await SaveWorkspaceMemoryRequest.validate(event);
      return this.json({ data: await saveWorkspaceMemoryAction.execute(new SaveWorkspaceMemoryDto(event.params.id, input)) }, 201);
    } catch (error) {
      return this.failure(error, 'Could not save workspace memory.');
    }
  }

  async update(event: RequestEvent) {
    try {
      const input = await ReviseWorkspaceMemoryRequest.validate(event);
      return this.json({ data: await reviseWorkspaceMemoryAction.execute(new ReviseWorkspaceMemoryDto(event.params.id, event.params.memoryId, input)) });
    } catch (error) {
      if (error instanceof WorkspaceMemoryConflictError) return this.json({ error: error.message, current: error.current }, 409);
      return this.failure(error, 'Could not revise workspace memory.');
    }
  }

  async destroy(event: RequestEvent) {
    try {
      return this.json({ data: await archiveWorkspaceMemoryAction.execute(new ArchiveWorkspaceMemoryDto(event.params.id, event.params.memoryId)) });
    } catch (error) {
      return this.failure(error, 'Could not archive workspace memory.');
    }
  }

  private failure(error: unknown, fallback: string) {
    return this.json({ error: error instanceof Error ? error.message : fallback }, 400);
  }
}
