import { FormRequest } from '@beeblock/svelar/forms';
import { createAgentReviewSchema, type CreateAgentReviewInput } from '$lib/modules/agent-room/contracts/schemas/review-schemas.schema.js';

export class CreateAgentReviewRequest extends FormRequest {
  rules() {
    return createAgentReviewSchema;
  }

  authorize(event: any): boolean {
    // Return false to throw 403 Forbidden
    return true;
  }

  passedValidation(data: unknown): CreateAgentReviewInput {
    return createAgentReviewSchema.parse(data);
  }
}
