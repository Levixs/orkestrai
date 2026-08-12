import { FormRequest } from '@beeblock/svelar/forms';
import { updateAgentReviewCommentSchema, type UpdateAgentReviewCommentInput } from '$lib/modules/agent-room/contracts/schemas/review-schemas.schema.js';

export class UpdateAgentReviewCommentRequest extends FormRequest {
  rules() {
    return updateAgentReviewCommentSchema;
  }

  authorize(event: any): boolean {
    // Return false to throw 403 Forbidden
    return true;
  }

  passedValidation(data: unknown): UpdateAgentReviewCommentInput {
    return updateAgentReviewCommentSchema.parse(data);
  }
}
