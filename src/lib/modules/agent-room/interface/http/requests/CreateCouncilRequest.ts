import { FormRequest } from '@beeblock/svelar/forms';
import { createCouncilSchema, type CreateCouncilInput } from '../../../contracts/schemas/council.schema.js';

export class CreateCouncilRequest extends FormRequest {
  rules() { return createCouncilSchema; }
  authorize() { return true; }
  passedValidation(data: unknown): CreateCouncilInput { return createCouncilSchema.parse(data); }
}
