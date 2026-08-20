import type { ApiClientOAuthDto } from '../dto/ApiClientDtos.js';
import { apiClientOAuthService } from '../services/ApiClientOAuthService.js';

export class AuthorizeApiClientOAuthAction {
  execute(input: { workspaceId: string; dto: ApiClientOAuthDto; origin: string }) {
    return apiClientOAuthService.authorize(input.workspaceId, input.dto, input.origin);
  }
}
