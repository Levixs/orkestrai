import { Controller } from '@beeblock/svelar/routing';
import { ExecuteDeviceCommandAction } from '../../../application/actions/ExecuteDeviceCommandAction.js';
import { ExecuteDeviceCommandDto } from '../../../application/dto/ExecuteDeviceCommandDto.js';
import { deviceService } from '../../../application/services/DeviceService.js';
import { DeviceCommandRequest } from '../requests/DeviceCommandRequest.js';
import { DeviceResource } from '../resources/DeviceResource.js';

export class DeviceController extends Controller {
  async index(event: any) {
    try {
      const snapshot = await deviceService.snapshot(event.params.id);
      return this.json({ data: new DeviceResource(snapshot).toJSON() });
    } catch (error) {
      return this.failure(error, 'Could not inspect mobile devices.');
    }
  }

  async command(event: any) {
    try {
      const input = await DeviceCommandRequest.validate(event);
      const response = await new ExecuteDeviceCommandAction().execute({
        workspaceId: event.params.id,
        dto: ExecuteDeviceCommandDto.from(input),
      });
      return this.json({
        data: {
          snapshot: new DeviceResource(response.snapshot).toJSON(),
          result: response.result,
        },
      });
    } catch (error) {
      return this.failure(error, 'Could not execute the device command.');
    }
  }

  async stream(event: any) {
    try {
      return await deviceService.stream(event.params.id, event.request.signal);
    } catch (error) {
      return new Response(error instanceof Error ? error.message : 'Device stream unavailable.', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
  }

  private failure(error: unknown, fallback: string, status = 400) {
    return this.json({ error: error instanceof Error ? error.message : fallback }, status);
  }
}
