import type { ExecuteSavedApiClientRequestDto } from '../dto/ApiClientDtos.js';
import { apiClientService } from '../services/ApiClientService.js';

export class ExecuteSavedApiClientRequestAction {
  execute(input: { workspaceId: string; nodeId: string; dto: ExecuteSavedApiClientRequestDto }) {
    const { requestId, variables, from } = input.dto.input;
    return apiClientService.executeSaved(input.workspaceId, input.nodeId, requestId, variables, from);
  }
}
