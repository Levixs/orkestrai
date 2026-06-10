import { FormRequest } from '@beeblock/svelar/forms';
import { resetPasswordSchema } from '$lib/modules/auth/contracts/schemas/schemas.js';

export class ResetPasswordRequest extends FormRequest {
  rules() {
    return resetPasswordSchema;
  }
}
