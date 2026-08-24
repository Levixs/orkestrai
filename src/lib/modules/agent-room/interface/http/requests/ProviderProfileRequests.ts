import { FormRequest } from '@beeblock/svelar/forms';
import {
  saveProviderProfileSchema,
  type SaveProviderProfileInput,
} from '$lib/modules/agent-room/contracts/schemas/providerProfileSchemas.js';

export class SaveProviderProfileRequest extends FormRequest {
  rules() {
    return saveProviderProfileSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): SaveProviderProfileInput {
    return saveProviderProfileSchema.parse(data);
  }
}
