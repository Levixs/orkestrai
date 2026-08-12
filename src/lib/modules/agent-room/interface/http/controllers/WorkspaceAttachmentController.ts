import { Controller } from '@beeblock/svelar/routing';
import { workspaceAttachmentService } from '$lib/modules/agent-room/application/services/WorkspaceAttachmentService.js';
import {
  WorkspaceAttachmentDeleteRequest,
  WorkspaceAttachmentLinkRequest,
  WorkspaceAttachmentUploadRequest,
} from '../requests/WorkspaceAttachmentRequests.js';

export class WorkspaceAttachmentController extends Controller {
  async create(event: any) {
    try {
      const contentType = event.request.headers.get('content-type') ?? '';
      const dto = contentType.includes('multipart/form-data')
        ? await WorkspaceAttachmentUploadRequest.validate(event)
        : await WorkspaceAttachmentLinkRequest.validate(event);
      return this.json({ data: await workspaceAttachmentService.create(event.params.id, dto) }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to attach this item.';
      return this.json({ error: message }, message.includes('10 MB') ? 413 : 422);
    }
  }

  async destroy(event: any) {
    try {
      const dto = await WorkspaceAttachmentDeleteRequest.validate(event);
      await workspaceAttachmentService.remove(event.params.id, dto);
      return this.json({ data: { deleted: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove this attachment.';
      return this.json({ error: message }, 422);
    }
  }
}
