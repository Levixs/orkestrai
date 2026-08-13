import type { DeviceCommandInput } from '../../contracts/schemas/device.schema.js';

export class ExecuteDeviceCommandDto {
  constructor(public readonly command: DeviceCommandInput) {}

  static from(input: DeviceCommandInput): ExecuteDeviceCommandDto {
    return new ExecuteDeviceCommandDto(input);
  }
}
