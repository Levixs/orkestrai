import type { ExecuteApiClientRequestDto } from '../dto/ApiClientDtos.js';
import { apiClientService } from '../services/ApiClientService.js';

export class ExecuteApiClientRequestAction {
  execute(input: { workspaceId: string; dto: ExecuteApiClientRequestDto }) {
    return apiClientService.execute(input.workspaceId, input.dto);
  }
}
