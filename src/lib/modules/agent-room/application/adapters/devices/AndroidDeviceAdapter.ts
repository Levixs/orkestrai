import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DeviceCommandInput, DeviceCommandResult, DeviceDescriptor, DevicePlatformAvailability } from '../../../contracts/schemas/device.schema.js';
import type { DeviceAdapter, DeviceAdapterContext, DeviceRuntimeSession } from './types.js';

const execFileAsync = promisify(execFile);

export class AndroidDeviceAdapter implements DeviceAdapter {
  readonly platform = 'android' as const;

  private async adbAvailable(): Promise<boolean> {
    try {
      await execFileAsync('adb', ['version'], { timeout: 3_000, windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }

  async availability(): Promise<DevicePlatformAvailability> {
    if (!(await this.adbAvailable())) {
      return {
        platform: 'android', available: false, reason: 'android_sdk_missing', detail: null,
        setupUrl: 'https://developer.android.com/studio/releases/platform-tools',
      };
    }
    return {
      platform: 'android', available: false, reason: 'backend_pending', detail: null,
      setupUrl: 'https://developer.android.com/studio/run/emulator',
    };
  }

  async list(): Promise<DeviceDescriptor[]> { return []; }
  async start(): Promise<DeviceRuntimeSession> { throw new Error('Android streaming is available in the next Device backend milestone.'); }
  async stop(): Promise<void> {}
  async health(): Promise<boolean> { return false; }
  async command(
    _session: DeviceRuntimeSession,
    _input: Exclude<DeviceCommandInput, { command: 'start' | 'stop' }>,
    _context: DeviceAdapterContext,
  ): Promise<DeviceCommandResult | null> {
    throw new Error('Android streaming is available in the next Device backend milestone.');
  }
}
