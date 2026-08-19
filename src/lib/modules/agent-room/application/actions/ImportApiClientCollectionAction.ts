import type { ImportApiClientCollectionDto } from '../dto/ApiClientDtos.js';
import { apiClientService } from '../services/ApiClientService.js';

export class ImportApiClientCollectionAction {
  execute(input: { workspaceId: string; dto: ImportApiClientCollectionDto }) {
    return apiClientService.import(input.workspaceId, input.dto);
  }
}
