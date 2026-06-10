import { FormRequest } from '@beeblock/svelar/forms';
import { otpVerifySchema } from '$lib/modules/auth/contracts/schemas/schemas.js';

export class OtpVerifyRequest extends FormRequest {
  rules() {
    return otpVerifySchema;
  }
}
