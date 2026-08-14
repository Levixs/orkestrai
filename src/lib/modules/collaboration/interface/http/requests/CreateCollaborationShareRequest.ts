import { FormRequest } from '@beeblock/svelar/forms';
import { z } from '@beeblock/svelar/validation';
import { createCollaborationShareSchema } from '../../../contracts/schemas/collaboration.schema.js';

const createCollaborationShareRequestSchema = createCollaborationShareSchema.extend({
  id: z.string().uuid(),
});

export class CreateCollaborationShareRequest extends FormRequest {
  rules() {
    return createCollaborationShareRequestSchema;
  }

  authorize(event: any): boolean {
    return true;
  }

  passedValidation(data: unknown) {
    const { id: _workspaceId, ...input } = createCollaborationShareRequestSchema.parse(data);
    return createCollaborationShareSchema.parse(input);
  }
}
