import { Controller } from '@beeblock/svelar/routing';
import { ApplyDesignOperationsDto, ExportDesignPdfDto, ImportDesignAssetDto, UploadDesignThumbnailDto } from '$lib/modules/agent-room/application/dto/DesignDtos.js';
import {
  DesignRevisionConflictError,
  designDocumentService,
} from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import { ApplyDesignOperationsRequest, ImportDesignAssetRequest, UploadDesignThumbnailRequest } from '$lib/modules/agent-room/interface/http/requests/DesignRequests.js';
import { ExportDesignPdfRequest } from '$lib/modules/agent-room/interface/http/requests/DesignRequests.js';
import { designExportService } from '$lib/modules/agent-room/application/services/DesignExportService.js';
import { DesignLeaseConflictError } from '$lib/modules/agent-room/application/services/DesignCollaborationService.js';

export class DesignDocumentController extends Controller {
  async show(event: any) {
    try {
      return this.json({ data: await designDocumentService.get(event.params.id, event.params.nodeId) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Design document not found.' }, 404);
    }
  }

  async apply(event: any) {
    try {
      const input = await ApplyDesignOperationsRequest.validate(event);
      return this.json({ data: await designDocumentService.apply(ApplyDesignOperationsDto.from(event.params.id, event.params.nodeId, input)) });
    } catch (error) {
      if (error instanceof DesignRevisionConflictError) {
        return this.json({ error: 'design_revision_conflict', data: error.current }, 409);
      }
      if (error instanceof DesignLeaseConflictError) {
        return this.json({ error: 'design_lease_conflict', data: error.lease }, 423);
      }
      return this.json({ error: error instanceof Error ? error.message : 'Failed to update design document.' }, 400);
    }
  }

  async importAsset(event: any) {
    try {
      const input = await ImportDesignAssetRequest.validate(event);
      const dto = ImportDesignAssetDto.from(event.params.id, event.params.nodeId, input);
      return this.json({
        data: await designDocumentService.importAsset(
          dto.workspaceId,
          dto.nodeId,
          dto.baseRevision,
          dto.file,
          { width: dto.width, height: dto.height },
        ),
      }, 201);
    } catch (error) {
      if (error instanceof DesignRevisionConflictError) {
        return this.json({ error: 'design_revision_conflict', data: error.current }, 409);
      }
      const message = error instanceof Error ? error.message : 'Failed to import design asset.';
      return this.json({ error: message }, message.includes('20 MB') ? 413 : 422);
    }
  }

  async exportPdf(event: any) {
    try {
      const input = await ExportDesignPdfRequest.validate(event);
      const dto = ExportDesignPdfDto.from(input);
      const pdf = await designExportService.pdf(dto);
      return new Response(Uint8Array.from(pdf).buffer, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${dto.name.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf"`,
          'cache-control': 'no-store',
        },
      });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Failed to export design PDF.' }, 422);
    }
  }

  async thumbnail(event: any) {
    try {
      const thumbnail = await designDocumentService.getThumbnail(event.params.id, event.params.nodeId);
      if (!thumbnail) return new Response(null, { status: 404 });
      const requestedRevision = Number(event.url.searchParams.get('revision'));
      if (Number.isInteger(requestedRevision) && requestedRevision !== thumbnail.revision) {
        return new Response(null, { status: 404 });
      }
      return new Response(Uint8Array.from(thumbnail.data).buffer, {
        headers: {
          'content-type': 'image/png',
          'cache-control': 'private, max-age=31536000, immutable',
          'x-design-revision': String(thumbnail.revision),
        },
      });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Design thumbnail not found.' }, 404);
    }
  }

  async uploadThumbnail(event: any) {
    try {
      const input = await UploadDesignThumbnailRequest.validate(event);
      const dto = UploadDesignThumbnailDto.from(event.params.id, event.params.nodeId, input);
      await designDocumentService.uploadThumbnail(dto.workspaceId, dto.nodeId, dto.revision, dto.file);
      return this.json({ data: { revision: dto.revision } });
    } catch (error) {
      if (error instanceof DesignRevisionConflictError) {
        return this.json({ error: 'design_revision_conflict', data: error.current }, 409);
      }
      return this.json({ error: error instanceof Error ? error.message : 'Failed to update design thumbnail.' }, 422);
    }
  }
}
