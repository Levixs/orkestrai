import { FormRequest } from '@beeblock/svelar/forms';
import { decideCouncilSchema, type DecideCouncilInput } from '../../../contracts/schemas/council.schema.js';

export class DecideCouncilRequest extends FormRequest {
  rules() { return decideCouncilSchema; }
  authorize() { return true; }
  passedValidation(data: unknown): DecideCouncilInput { return decideCouncilSchema.parse(data); }
}
