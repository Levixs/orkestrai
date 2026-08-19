import { Controller } from '@beeblock/svelar/routing';
import {
  ApplyDesignFigmaSyncDto,
  ImportDesignFigmaDto,
  InspectDesignFigmaDto,
  PreviewDesignFigmaSyncDto,
} from '../../../application/dto/DesignFigmaDtos.js';
import { designFigmaService } from '../../../application/services/DesignFigmaService.js';
import { DesignRevisionConflictError } from '../../../application/services/DesignDocumentService.js';
import { designDocumentService } from '../../../application/services/DesignDocumentService.js';
import { bridgeService } from '../../../application/services/BridgeService.js';
import {
  ApplyDesignFigmaSyncRequest,
  DisconnectDesignFigmaRequest,
  ImportDesignFigmaRequest,
  InspectDesignFigmaRequest,
  PreviewDesignFigmaSyncRequest,
} from '../requests/DesignFigmaRequests.js';

export class DesignFigmaController extends Controller {
  async status(event: any) {
    return this.json({ data: await designFigmaService.status(event.params.id) });
  }

  async pluginConnection(event: any) {
    try {
      const document = await designDocumentService.get(event.params.id, event.params.nodeId);
      const token = await bridgeService.getOrCreateToken(event.params.id, event.url.origin);
      return this.json({ data: {
        apiUrl: event.url.origin,
        token,
        designNodeId: document.nodeId,
        targetPageId: document.activePageId,
      } });
    } catch (error) {
      return this.failure(error);
    }
  }

  async inspect(event: any) {
    try {
      const input = await InspectDesignFigmaRequest.validate(event);
      return this.json({ data: await designFigmaService.inspect(InspectDesignFigmaDto.from(event.params.id, event.params.nodeId, input)) });
    } catch (error) {
      return this.failure(error);
    }
  }

  async import(event: any) {
    try {
      const input = await ImportDesignFigmaRequest.validate(event);
      return this.json({ data: await designFigmaService.import(ImportDesignFigmaDto.from(event.params.id, event.params.nodeId, input)) }, 201);
    } catch (error) {
      return this.failure(error);
    }
  }

  async preview(event: any) {
    try {
      const input = await PreviewDesignFigmaSyncRequest.validate(event);
      return this.json({ data: await designFigmaService.preview(PreviewDesignFigmaSyncDto.from(event.params.id, event.params.nodeId, input)) });
    } catch (error) {
      return this.failure(error);
    }
  }

  async apply(event: any) {
    try {
      const input = await ApplyDesignFigmaSyncRequest.validate(event);
      return this.json({ data: await designFigmaService.applySync(ApplyDesignFigmaSyncDto.from(event.params.id, event.params.nodeId, input)) });
    } catch (error) {
      return this.failure(error);
    }
  }

  async disconnect(event: any) {
    try {
      const input = await DisconnectDesignFigmaRequest.validate(event);
      return this.json({ data: await designFigmaService.disconnect(event.params.id, event.params.nodeId, input.linkId, input.baseRevision) });
    } catch (error) {
      return this.failure(error);
    }
  }

  private failure(error: unknown) {
    if (error instanceof DesignRevisionConflictError) return this.json({ error: 'design_revision_conflict', data: error.current }, 409);
    const message = error instanceof Error ? error.message : 'figma_request_failed';
    const status = message.includes('rate limit') ? 429 : message.includes('credential') ? 401 : message.includes('not found') ? 404 : 422;
    return this.json({ error: message }, status);
  }
}
