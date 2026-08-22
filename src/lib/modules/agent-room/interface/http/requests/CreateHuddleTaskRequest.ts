import { FormRequest } from '@beeblock/svelar/forms';
import { createHuddleTaskSchema, type CreateHuddleTaskInput } from '../../../contracts/schemas/huddle.schema.js';

export class CreateHuddleTaskRequest extends FormRequest {
  rules() {
    return createHuddleTaskSchema;
  }
  authorize() {
    return true;
  }
  passedValidation(data: unknown): CreateHuddleTaskInput {
    return createHuddleTaskSchema.parse(data);
  }
}
