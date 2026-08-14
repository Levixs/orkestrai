import { FormRequest } from '@beeblock/svelar/forms';
import { sendRemoteCollaborationCommandSchema } from '../../../contracts/schemas/collaboration.schema.js';

export class SendRemoteCollaborationCommandRequest extends FormRequest {
  rules() {
    return sendRemoteCollaborationCommandSchema;
  }

  authorize(event: any): boolean {
    return true;
  }

  passedValidation(data: unknown) {
    return sendRemoteCollaborationCommandSchema.parse(data);
  }
}
