import { FormRequest } from '@beeblock/svelar/forms';
import { decideAgentReviewSchema, type DecideAgentReviewInput } from '$lib/modules/agent-room/contracts/schemas/review-schemas.schema.js';

export class DecideAgentReviewRequest extends FormRequest {
  rules() {
    return decideAgentReviewSchema;
  }

  authorize(event: any): boolean {
    // Return false to throw 403 Forbidden
    return true;
  }

  passedValidation(data: unknown): DecideAgentReviewInput {
    return decideAgentReviewSchema.parse(data);
  }
}
