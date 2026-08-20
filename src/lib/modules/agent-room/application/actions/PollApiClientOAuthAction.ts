import type { ApiClientOAuthDto } from '../dto/ApiClientDtos.js';
import { apiClientOAuthService } from '../services/ApiClientOAuthService.js';

export class PollApiClientOAuthAction {
  execute(input: { workspaceId: string; dto: ApiClientOAuthDto }) {
    return apiClientOAuthService.poll(input.workspaceId, input.dto);
  }
}
