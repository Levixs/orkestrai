import { FormRequest } from '@beeblock/svelar/forms';
import {
  deviceCommandSchema,
  type DeviceCommandInput,
} from '../../../contracts/schemas/device.schema.js';

export class DeviceCommandRequest extends FormRequest {
  rules() { return deviceCommandSchema; }
  authorize() { return true; }
  passedValidation(data: unknown): DeviceCommandInput { return deviceCommandSchema.parse(data); }
}
