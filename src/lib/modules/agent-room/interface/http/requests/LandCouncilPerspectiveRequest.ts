import { FormRequest } from '@beeblock/svelar/forms';
import { landCouncilPerspectiveSchema, type LandCouncilPerspectiveInput } from '../../../contracts/schemas/council.schema.js';

export class LandCouncilPerspectiveRequest extends FormRequest {
  rules() { return landCouncilPerspectiveSchema; }
  authorize() { return true; }
  passedValidation(data: unknown): LandCouncilPerspectiveInput { return landCouncilPerspectiveSchema.parse(data); }
}
