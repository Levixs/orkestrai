import { apiClientOAuthService } from '../services/ApiClientOAuthService.js';

export class CompleteApiClientOAuthAction {
  execute(input: { workspaceId: string; state: string; code: string | null; error: string | null }) {
    return apiClientOAuthService.complete(input.workspaceId, input.state, input.code, input.error);
  }
}
