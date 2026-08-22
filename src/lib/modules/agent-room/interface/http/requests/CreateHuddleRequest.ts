import { FormRequest } from '@beeblock/svelar/forms';
import { createHuddleSchema, type CreateHuddleInput } from '../../../contracts/schemas/huddle.schema.js';

export class CreateHuddleRequest extends FormRequest {
  rules() {
    return createHuddleSchema;
  }
  authorize() {
    return true;
  }
  passedValidation(data: unknown): CreateHuddleInput {
    return createHuddleSchema.parse(data);
  }
}
