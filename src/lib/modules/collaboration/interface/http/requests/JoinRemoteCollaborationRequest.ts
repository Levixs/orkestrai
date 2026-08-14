import { FormRequest } from '@beeblock/svelar/forms';
import { joinRemoteCollaborationSchema } from '../../../contracts/schemas/collaboration.schema.js';

export class JoinRemoteCollaborationRequest extends FormRequest {
  rules() {
    return joinRemoteCollaborationSchema;
  }

  authorize(event: any): boolean {
    return true;
  }

  passedValidation(data: unknown) {
    return joinRemoteCollaborationSchema.parse(data);
  }
}
