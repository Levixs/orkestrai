import { FormRequest } from '@beeblock/svelar/forms';
import {
  designPresenceHeartbeatSchema,
  leaveDesignPresenceSchema,
  type DesignPresenceHeartbeatInput,
  type LeaveDesignPresenceInput,
} from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';

export class DesignPresenceHeartbeatRequest extends FormRequest {
  rules() { return designPresenceHeartbeatSchema; }
  authorize(): boolean { return true; }
  passedValidation(data: unknown): DesignPresenceHeartbeatInput { return designPresenceHeartbeatSchema.parse(data); }
}

export class LeaveDesignPresenceRequest extends FormRequest {
  rules() { return leaveDesignPresenceSchema; }
  authorize(): boolean { return true; }
  passedValidation(data: unknown): LeaveDesignPresenceInput { return leaveDesignPresenceSchema.parse(data); }
}
