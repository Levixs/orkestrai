import { FormRequest } from '@beeblock/svelar/forms';
import {
  designVisualReviewSchema,
  type DesignVisualReviewInput,
} from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';

export class DesignReviewRequest extends FormRequest {
  rules() {
    return designVisualReviewSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): DesignVisualReviewInput {
    return designVisualReviewSchema.parse(data);
  }
}
