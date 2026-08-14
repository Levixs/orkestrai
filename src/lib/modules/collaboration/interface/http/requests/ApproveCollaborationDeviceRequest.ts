import { FormRequest } from '@beeblock/svelar/forms';
import { z } from '@beeblock/svelar/validation';
import { approveCollaborationDeviceSchema } from '../../../contracts/schemas/collaboration.schema.js';

const approveCollaborationDeviceRequestSchema = approveCollaborationDeviceSchema.extend({
  id: z.string().uuid(),
  shareId: z.string().uuid(),
  deviceId: z.string().uuid(),
});

export class ApproveCollaborationDeviceRequest extends FormRequest {
  rules() {
    return approveCollaborationDeviceRequestSchema;
  }

  authorize(event: any): boolean {
    // Return false to throw 403 Forbidden
    return true;
  }

  passedValidation(data: unknown) {
    const {
      id: _workspaceId,
      shareId: _shareId,
      deviceId: _deviceId,
      ...input
    } = approveCollaborationDeviceRequestSchema.parse(data);
    return approveCollaborationDeviceSchema.parse(input);
  }
}
