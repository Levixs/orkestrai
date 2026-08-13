import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import type { DeviceCommandInput, DeviceCommandResult, DeviceDescriptor, DevicePlatform, DevicePlatformAvailability } from '$lib/modules/agent-room/contracts/schemas/device.schema.js';
import type { DeviceAdapter, DeviceAdapterContext, DeviceRuntimeSession } from '$lib/modules/agent-room/application/adapters/devices/types.js';
import { DeviceService } from '$lib/modules/agent-room/application/services/DeviceService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

class FakeIosAdapter implements DeviceAdapter {
  readonly platform: DevicePlatform;
  commands: DeviceCommandInput[] = [];
  started = 0;
  stopped = 0;
  readonly device: DeviceDescriptor;
  private readonly runtimeDeviceId: string | null;

  constructor(platform: DevicePlatform = 'ios', physical = false, runtimeDeviceId: string | null = null) {
    this.platform = platform;
    this.runtimeDeviceId = runtimeDeviceId;
    this.device = {
      id: '00000000-0000-4000-8000-000000000099',
      name: platform === 'android' ? 'Test Pixel' : 'Test iPhone',
      platform,
      runtime: platform === 'android' ? 'Android Test' : 'iOS Test',
      state: 'shutdown',
      available: true,
      physical,
    };
  }

  async availability(): Promise<DevicePlatformAvailability> {
    return { platform: this.platform, available: true, reason: 'ready', detail: null, setupUrl: null };
  }
  async list() { return [this.device]; }
  async start(workspaceId: string, device: DeviceDescriptor): Promise<DeviceRuntimeSession> {
    this.started += 1;
    return {
      public: {
        workspaceId, platform: this.platform, deviceId: this.runtimeDeviceId ?? device.id, deviceName: device.name,
        status: 'streaming', orientation: 'portrait', startedByOrkestrai: true,
        attachedAt: new Date().toISOString(), lastError: null,
      },
      streamUrl: 'http://127.0.0.1:1/stream.mjpeg',
      helperBaseUrl: 'http://127.0.0.1:1',
      controlUrl: null,
      helperStartedByOrkestrai: true,
      restartDeviceId: device.id,
      touchedAt: Date.now(),
    };
  }
  async stop() { this.stopped += 1; }
  async health() { return true; }
  async command(
    _session: DeviceRuntimeSession,
    input: Exclude<DeviceCommandInput, { command: 'start' | 'stop' | 'restart' }>,
    _context: DeviceAdapterContext,
  ): Promise<DeviceCommandResult | null> {
    this.commands.push(input);
    return input.command === 'tree' ? { kind: 'tree', tree: [{ label: 'Login' }], truncated: false } : null;
  }
}

describe('DeviceService', () => {
  useSvelarTest({ refreshDatabase: true });
  const directories: string[] = [];
  const services: DeviceService[] = [];

  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.stopAll()));
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('keeps one traceable device session per workspace and stops owned runtimes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orkestrai-device-'));
    directories.push(directory);
    const workspace = await workspaceRepository.createWorkspace({ name: 'Device test', workingDir: directory });
    const adapter = new FakeIosAdapter();
    const service = new DeviceService([adapter]);
    services.push(service);

    const started = await service.execute(workspace.id, { command: 'start', platform: 'ios', deviceId: adapter.device.id });
    expect(started.snapshot.session).toMatchObject({ deviceName: 'Test iPhone', status: 'streaming', startedByOrkestrai: true });

    const tree = await service.execute(workspace.id, { command: 'tree' });
    expect(tree.result).toEqual({ kind: 'tree', tree: [{ label: 'Login' }], truncated: false });

    await service.execute(workspace.id, { command: 'stop' });
    expect(adapter.stopped).toBe(1);
    expect((await service.snapshot(workspace.id)).session).toBeNull();
  });

  it('confines install artifacts to the workspace after resolving paths', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orkestrai-device-path-'));
    directories.push(directory);
    const workspace = await workspaceRepository.createWorkspace({ name: 'Device paths', workingDir: directory });
    const adapter = new FakeIosAdapter();
    const service = new DeviceService([adapter]);
    services.push(service);
    await service.execute(workspace.id, { command: 'start', platform: 'ios', deviceId: adapter.device.id });

    writeFileSync(join(directory, 'Example.ipa'), 'fixture');
    await service.execute(workspace.id, { command: 'install', path: 'Example.ipa' });
    expect(adapter.commands.at(-1)).toMatchObject({ command: 'install', path: realpathSync(join(directory, 'Example.ipa')) });

    await expect(service.execute(workspace.id, { command: 'install', path: '/etc/hosts' }))
      .rejects.toThrow('inside the workspace');
  });

  it('requires explicit confirmation before attaching a physical Android device', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orkestrai-device-physical-'));
    directories.push(directory);
    const workspace = await workspaceRepository.createWorkspace({ name: 'Physical device', workingDir: directory });
    const adapter = new FakeIosAdapter('android', true);
    const service = new DeviceService([adapter]);
    services.push(service);

    await expect(service.execute(workspace.id, {
      command: 'start', platform: 'android', deviceId: adapter.device.id,
    })).rejects.toThrow('explicit user confirmation');

    const started = await service.execute(workspace.id, {
      command: 'start', platform: 'android', deviceId: adapter.device.id, confirmPhysical: true,
    });
    expect(started.snapshot.session).toMatchObject({ platform: 'android', deviceName: 'Test Pixel' });
  });

  it('restarts an emulator through its stable source id instead of its temporary runtime serial', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orkestrai-device-restart-'));
    directories.push(directory);
    const workspace = await workspaceRepository.createWorkspace({ name: 'Restart device', workingDir: directory });
    const adapter = new FakeIosAdapter('android', false, 'emulator-5554');
    const service = new DeviceService([adapter]);
    services.push(service);

    await service.execute(workspace.id, {
      command: 'start', platform: 'android', deviceId: adapter.device.id,
    });
    const restarted = await service.execute(workspace.id, { command: 'restart' });

    expect(adapter.started).toBe(2);
    expect(adapter.stopped).toBe(1);
    expect(restarted.snapshot.session?.deviceId).toBe('emulator-5554');
  });
});
