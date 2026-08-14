import { FormRequest } from '@beeblock/svelar/forms';
import { executeCollaborationCommandSchema } from '../../../contracts/schemas/collaboration.schema.js';

export class ExecuteCollaborationCommandRequest extends FormRequest {
  rules() {
    return executeCollaborationCommandSchema;
  }

  authorize(event: any): boolean {
    // Return false to throw 403 Forbidden
    return true;
  }

  passedValidation(data: unknown) {
    return executeCollaborationCommandSchema.parse(data);
  }
}
