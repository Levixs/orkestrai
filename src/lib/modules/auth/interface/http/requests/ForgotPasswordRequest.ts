import { FormRequest } from '@beeblock/svelar/forms';
import { forgotPasswordSchema } from '$lib/modules/auth/contracts/schemas/schemas.js';

export class ForgotPasswordRequest extends FormRequest {
  rules() {
    return forgotPasswordSchema;
  }
}
