import { FormRequest } from '@beeblock/svelar/forms';
import { registerSchema } from '$lib/modules/auth/contracts/schemas/schemas.js';

export class RegisterRequest extends FormRequest {
  rules() {
    return registerSchema;
  }
}
