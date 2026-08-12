import { FormRequest } from '@beeblock/svelar/forms';
import {
  workspaceSearchSchema,
  type WorkspaceSearchInput,
} from '$lib/modules/agent-room/contracts/schemas/workspaceSearchSchema.js';

export class WorkspaceSearchRequest extends FormRequest {
  rules() {
    return workspaceSearchSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): WorkspaceSearchInput {
    return workspaceSearchSchema.parse(data);
  }
}
