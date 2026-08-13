import type {
  DeviceCommandInput,
  DeviceCommandResult,
  DeviceDescriptor,
  DevicePlatform,
  DevicePlatformAvailability,
  DeviceSession,
} from '../../../contracts/schemas/device.schema.js';

export type DeviceRuntimeSession = {
  public: DeviceSession;
  streamUrl: string;
  helperBaseUrl: string;
  controlUrl: string | null;
  helperStartedByOrkestrai: boolean;
  touchedAt: number;
};

export type DeviceAdapterContext = {
  workspaceRoot: string;
  screenshotDirectory: string;
};

export interface DeviceAdapter {
  readonly platform: DevicePlatform;
  availability(): Promise<DevicePlatformAvailability>;
  list(): Promise<DeviceDescriptor[]>;
  start(workspaceId: string, device: DeviceDescriptor): Promise<DeviceRuntimeSession>;
  stop(session: DeviceRuntimeSession): Promise<void>;
  health(session: DeviceRuntimeSession): Promise<boolean>;
  command(
    session: DeviceRuntimeSession,
    input: Exclude<DeviceCommandInput, { command: 'start' | 'stop' }>,
    context: DeviceAdapterContext,
  ): Promise<DeviceCommandResult | null>;
}
