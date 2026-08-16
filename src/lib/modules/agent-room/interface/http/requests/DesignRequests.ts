import { FormRequest } from '@beeblock/svelar/forms';
import {
  applyDesignOperationsSchema,
  type ApplyDesignOperationsInput,
} from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';

export class ApplyDesignOperationsRequest extends FormRequest {
  rules() {
    return applyDesignOperationsSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): ApplyDesignOperationsInput {
    return applyDesignOperationsSchema.parse(data);
  }
}
