import { Action } from '@beeblock/svelar/actions';
import type { DeviceCommandResponse } from '../../contracts/schemas/device.schema.js';
import type { ExecuteDeviceCommandDto } from '../dto/ExecuteDeviceCommandDto.js';
import { deviceService } from '../services/DeviceService.js';

type Input = { workspaceId: string; dto: ExecuteDeviceCommandDto };

export class ExecuteDeviceCommandAction extends Action<Input, DeviceCommandResponse> {
  async execute(input: Input): Promise<DeviceCommandResponse> {
    return deviceService.execute(input.workspaceId, input.dto.command);
  }
}
