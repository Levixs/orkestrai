import { FormRequest } from '@beeblock/svelar/forms';
import {
  listAttentionSchema,
  type ListAttentionInput,
} from '$lib/modules/agent-room/contracts/schemas/attention.schema.js';

export class ListAttentionRequest extends FormRequest {
  rules() {
    return listAttentionSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): ListAttentionInput {
    return listAttentionSchema.parse(data);
  }
}
