import { FormRequest } from '@beeblock/svelar/forms';
import { submitHuddleTurnSchema, type SubmitHuddleTurnInput } from '../../../contracts/schemas/huddle.schema.js';

export class SubmitHuddleTurnRequest extends FormRequest {
  rules() {
    return submitHuddleTurnSchema;
  }
  authorize() {
    return true;
  }
  passedValidation(data: unknown): SubmitHuddleTurnInput {
    return submitHuddleTurnSchema.parse(data);
  }
}
