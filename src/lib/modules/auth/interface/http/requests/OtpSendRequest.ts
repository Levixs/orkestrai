import { FormRequest } from '@beeblock/svelar/forms';
import { otpRequestSchema } from '$lib/modules/auth/contracts/schemas/schemas.js';

export class OtpSendRequest extends FormRequest {
  rules() {
    return otpRequestSchema;
  }
}
