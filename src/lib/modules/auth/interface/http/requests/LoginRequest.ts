import { FormRequest } from '@beeblock/svelar/forms';
import { loginSchema } from '$lib/modules/auth/contracts/schemas/schemas.js';

export class LoginRequest extends FormRequest {
  rules() {
    return loginSchema;
  }
}
