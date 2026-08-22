import { FormRequest } from '@beeblock/svelar/forms';
import { updateHuddleSchema, type UpdateHuddleInput } from '../../../contracts/schemas/huddle.schema.js';

export class UpdateHuddleRequest extends FormRequest {
  rules() {
    return updateHuddleSchema;
  }
  authorize() {
    return true;
  }
  passedValidation(data: unknown): UpdateHuddleInput {
    return updateHuddleSchema.parse(data);
  }
}
