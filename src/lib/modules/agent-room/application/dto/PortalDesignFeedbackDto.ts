import type {
  PortalDesignContext,
  PortalDesignDestination,
  SendPortalDesignFeedbackInput,
} from '../../contracts/schemas/portal-design-feedback.schema.js';
import type { WorkspaceAttachment } from '../../domain/types.js';

export class PortalDesignFeedbackDto {
  private constructor(
    readonly capture: PortalDesignContext,
    readonly screenshot: WorkspaceAttachment,
    readonly instruction: string,
    readonly destination: PortalDesignDestination,
  ) {}

  static fromInput(input: SendPortalDesignFeedbackInput): PortalDesignFeedbackDto {
    return new PortalDesignFeedbackDto(input.capture, input.screenshot, input.instruction, input.destination);
  }
}
