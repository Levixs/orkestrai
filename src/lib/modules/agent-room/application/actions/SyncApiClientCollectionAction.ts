import type { ApiClientSyncDto } from '../dto/ApiClientDtos.js';
import { apiClientSyncService } from '../services/ApiClientSyncService.js';

export class SyncApiClientCollectionAction {
  execute(input: { workspaceId: string; dto: ApiClientSyncDto }) {
    return apiClientSyncService.execute(input.workspaceId, input.dto);
  }
}
