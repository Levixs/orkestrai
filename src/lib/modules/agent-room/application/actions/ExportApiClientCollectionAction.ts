import type { ExportApiClientCollectionDto } from '../dto/ApiClientDtos.js';
import { apiClientService } from '../services/ApiClientService.js';

export class ExportApiClientCollectionAction {
  execute(input: { workspaceId: string; dto: ExportApiClientCollectionDto }) {
    return apiClientService.export(input.workspaceId, input.dto);
  }
}
