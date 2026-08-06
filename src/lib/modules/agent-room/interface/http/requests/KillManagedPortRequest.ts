import { FormRequest } from '@beeblock/svelar/forms';
import { killManagedPortSchema, type KillManagedPortInput } from '$lib/modules/agent-room/contracts/schemas/kill-managed-port.schema.js';

export class KillManagedPortRequest extends FormRequest {
  rules() {
    return killManagedPortSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): KillManagedPortInput {
    return killManagedPortSchema.parse(data);
  }
}
