import { FormRequest } from '@beeblock/svelar/forms';
import { createAgentReviewCommentSchema, type CreateAgentReviewCommentInput } from '$lib/modules/agent-room/contracts/schemas/review-schemas.schema.js';

export class CreateAgentReviewCommentRequest extends FormRequest {
  rules() {
    return createAgentReviewCommentSchema;
  }

  authorize(event: any): boolean {
    // Return false to throw 403 Forbidden
    return true;
  }

  passedValidation(data: unknown): CreateAgentReviewCommentInput {
    return createAgentReviewCommentSchema.parse(data);
  }
}
