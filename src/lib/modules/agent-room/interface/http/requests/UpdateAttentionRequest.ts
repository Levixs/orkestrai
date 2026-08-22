import { FormRequest } from '@beeblock/svelar/forms';
import {
  updateAttentionSchema,
  type UpdateAttentionInput,
} from '$lib/modules/agent-room/contracts/schemas/attention.schema.js';

export class UpdateAttentionRequest extends FormRequest {
  rules() {
    return updateAttentionSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): UpdateAttentionInput {
    return updateAttentionSchema.parse(data);
  }
}
