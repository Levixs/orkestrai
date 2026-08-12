import { FormRequest } from '@beeblock/svelar/forms';
import { PortalDesignFeedbackDto } from '$lib/modules/agent-room/application/dto/PortalDesignFeedbackDto.js';
import { sendPortalDesignFeedbackSchema } from '$lib/modules/agent-room/contracts/schemas/portal-design-feedback.schema.js';

export class SendPortalDesignFeedbackRequest extends FormRequest {
  rules() {
    return sendPortalDesignFeedbackSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): PortalDesignFeedbackDto {
    return PortalDesignFeedbackDto.fromInput(sendPortalDesignFeedbackSchema.parse(data));
  }
}
