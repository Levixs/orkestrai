import { Controller } from '@beeblock/svelar/routing';
import { DesignRevisionConflictError } from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import { designLibraryService } from '$lib/modules/agent-room/application/services/DesignLibraryService.js';
import { ImportDesignLibraryRequest, PublishDesignLibraryRequest } from '$lib/modules/agent-room/interface/http/requests/DesignLibraryRequests.js';

export class DesignLibraryController extends Controller {
  async index(event: any) {
    try {
      return this.json({ data: await designLibraryService.list(event.params.id) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Failed to list design libraries.' }, 400);
    }
  }

  async publish(event: any) {
    try {
      const input = await PublishDesignLibraryRequest.validate(event);
      return this.json({ data: await designLibraryService.publish(event.params.id, event.params.nodeId, input) }, input.libraryId ? 200 : 201);
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Failed to publish design library.' }, 422);
    }
  }

  async import(event: any) {
    try {
      const input = await ImportDesignLibraryRequest.validate(event);
      return this.json({ data: await designLibraryService.import(event.params.id, event.params.nodeId, event.params.libraryId, input.baseRevision) });
    } catch (error) {
      if (error instanceof DesignRevisionConflictError) return this.json({ error: 'design_revision_conflict', data: error.current }, 409);
      return this.json({ error: error instanceof Error ? error.message : 'Failed to import design library.' }, 422);
    }
  }

  async remove(event: any) {
    try {
      await designLibraryService.remove(event.params.id, event.params.nodeId, event.params.libraryId);
      return new Response(null, { status: 204 });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Failed to remove design library.' }, 422);
    }
  }
}
