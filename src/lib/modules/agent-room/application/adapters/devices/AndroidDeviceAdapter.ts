import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  DeviceCommandInput,
  DeviceCommandResult,
  DeviceDescriptor,
  DeviceOrientation,
  DevicePlatformAvailability,
} from '../../../contracts/schemas/device.schema.js';
import { AndroidScrcpyHelper } from './AndroidScrcpyHelper.js';
import { AndroidSdk } from './AndroidSdk.js';
import type { DeviceAdapter, DeviceAdapterContext, DeviceRuntimeSession } from './types.js';

const MAX_TEXT_RESULT = 120_000;
const MAX_TREE_RESULT = 250_000;
const orientationOrder: DeviceOrientation[] = [
  'portrait',
  'landscape_left',
  'portrait_upside_down',
  'landscape_right',
];

export class AndroidDeviceAdapter implements DeviceAdapter {
  readonly platform = 'android' as const;
  private readonly sdk: AndroidSdk;
  private readonly helpers = new Map<string, AndroidScrcpyHelper>();

  constructor(sdk = new AndroidSdk()) {
    this.sdk = sdk;
  }

  async availability(): Promise<DevicePlatformAvailability> {
    if (!(await this.sdk.adbPath())) {
      return {
        platform: 'android', available: false, reason: 'android_sdk_missing', detail: null,
        setupUrl: 'https://developer.android.com/studio/releases/platform-tools',
      };
    }
    try {
      const devices = await this.sdk.listDevices();
      if (!devices.some((device) => device.available)) {
        return {
          platform: 'android', available: false, reason: 'android_device_missing', detail: null,
          setupUrl: 'https://developer.android.com/studio/run/managing-avds',
        };
      }
    } catch (error) {
      return {
        platform: 'android', available: false, reason: 'android_sdk_missing',
        detail: error instanceof Error ? error.message.slice(0, 500) : null,
        setupUrl: 'https://developer.android.com/studio/releases/platform-tools',
      };
    }
    return {
      platform: 'android', available: true, reason: 'ready', detail: null, setupUrl: null,
    };
  }

  async list(): Promise<DeviceDescriptor[]> {
    if (!(await this.sdk.adbPath())) return [];
    return this.sdk.listDevices();
  }

  async start(workspaceId: string, device: DeviceDescriptor): Promise<DeviceRuntimeSession> {
    const attached = await this.sdk.attach(device);
    let helper: AndroidScrcpyHelper | null = null;
    try {
      helper = await AndroidScrcpyHelper.start(attached.serial);
      this.helpers.set(helper.baseUrl, helper);
      return {
        public: {
          workspaceId,
          platform: 'android',
          deviceId: attached.serial,
          deviceName: device.name,
          status: 'streaming',
          orientation: 'portrait',
          startedByOrkestrai: attached.startedByOrkestrai,
          attachedAt: new Date().toISOString(),
          lastError: null,
        },
        streamUrl: helper.streamUrl,
        helperBaseUrl: helper.baseUrl,
        controlUrl: null,
        helperStartedByOrkestrai: true,
        restartDeviceId: device.id,
        touchedAt: Date.now(),
      };
    } catch (error) {
      await helper?.close().catch(() => undefined);
      if (attached.startedByOrkestrai) await this.sdk.shutdown(attached.serial);
      throw error;
    }
  }

  async stop(session: DeviceRuntimeSession): Promise<void> {
    const helper = this.helpers.get(session.helperBaseUrl);
    this.helpers.delete(session.helperBaseUrl);
    await helper?.close().catch(() => undefined);
    if (session.public.startedByOrkestrai) {
      await this.sdk.shutdown(session.public.deviceId);
    }
  }

  async health(session: DeviceRuntimeSession): Promise<boolean> {
    return this.helpers.get(session.helperBaseUrl)?.health() ?? false;
  }

  async command(
    session: DeviceRuntimeSession,
    input: Exclude<DeviceCommandInput, { command: 'start' | 'stop' | 'restart' }>,
    context: DeviceAdapterContext,
  ): Promise<DeviceCommandResult | null> {
    const helper = this.helpers.get(session.helperBaseUrl);
    if (!helper?.health()) throw new Error('The Android stream helper is unavailable.');
    const serial = session.public.deviceId;
    if (input.command === 'tap') {
      await helper.tap(input.x, input.y);
      return null;
    }
    if (input.command === 'swipe') {
      await helper.swipe(input.fromX, input.fromY, input.toX, input.toY, input.durationMs);
      return null;
    }
    if (input.command === 'pinch') {
      await helper.pinch(
        input.centerX,
        input.centerY,
        input.startDistance,
        input.endDistance,
        input.durationMs,
      );
      return null;
    }
    if (input.command === 'type') {
      await helper.type(input.text);
      return null;
    }
    if (input.command === 'button') {
      await helper.button(input.button);
      return null;
    }
    if (input.command === 'rotate') {
      const current = orientationOrder.indexOf(session.public.orientation);
      const target = orientationOrder.indexOf(input.orientation);
      const steps = (target - current + orientationOrder.length) % orientationOrder.length;
      for (let step = 0; step < steps; step += 1) await helper.rotate();
      session.public.orientation = input.orientation;
      return null;
    }
    if (input.command === 'install') {
      await this.sdk.install(serial, input.path);
      return null;
    }
    if (input.command === 'launch') {
      await this.sdk.launch(serial, input.bundleId);
      return null;
    }
    if (input.command === 'screenshot') {
      await mkdir(context.screenshotDirectory, { recursive: true });
      const path = join(context.screenshotDirectory, `${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
      await this.sdk.screenshot(serial, path);
      return { kind: 'screenshot', path };
    }
    if (input.command === 'logs') {
      const content = await this.sdk.logs(serial, input.minutes);
      return {
        kind: 'logs',
        content: content.slice(-MAX_TEXT_RESULT),
        truncated: content.length > MAX_TEXT_RESULT,
      };
    }
    if (input.command === 'tree') {
      const tree = await this.sdk.accessibilityTree(serial);
      const serialized = JSON.stringify(tree);
      if (serialized.length > MAX_TREE_RESULT) {
        return { kind: 'tree', tree: { preview: serialized.slice(0, MAX_TREE_RESULT) }, truncated: true };
      }
      return { kind: 'tree', tree, truncated: false };
    }
    if (input.command === 'permissions') {
      const packageName = input.bundleId?.split('/')[0];
      const content = await this.sdk.permissions(serial, input.action, packageName, input.permission);
      return {
        kind: 'permissions',
        content: content.slice(-MAX_TEXT_RESULT),
        truncated: content.length > MAX_TEXT_RESULT,
      };
    }
    return null;
  }
}
