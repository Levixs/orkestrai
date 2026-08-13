import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import type { DeviceCommandInput, DeviceCommandResult, DeviceDescriptor, DevicePlatformAvailability } from '$lib/modules/agent-room/contracts/schemas/device.schema.js';
import type { DeviceAdapter, DeviceAdapterContext, DeviceRuntimeSession } from '$lib/modules/agent-room/application/adapters/devices/types.js';
import { DeviceService } from '$lib/modules/agent-room/application/services/DeviceService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

class FakeIosAdapter implements DeviceAdapter {
  readonly platform = 'ios' as const;
  commands: DeviceCommandInput[] = [];
  stopped = 0;
  readonly device: DeviceDescriptor = {
    id: '00000000-0000-4000-8000-000000000099',
    name: 'Test iPhone',
    platform: 'ios',
    runtime: 'iOS Test',
    state: 'shutdown',
    available: true,
    physical: false,
  };

  async availability(): Promise<DevicePlatformAvailability> {
    return { platform: 'ios', available: true, reason: 'ready', detail: null, setupUrl: null };
  }
  async list() { return [this.device]; }
  async start(workspaceId: string): Promise<DeviceRuntimeSession> {
    return {
      public: {
        workspaceId, platform: 'ios', deviceId: this.device.id, deviceName: this.device.name,
        status: 'streaming', orientation: 'portrait', startedByOrkestrai: true,
        attachedAt: new Date().toISOString(), lastError: null,
      },
      streamUrl: 'http://127.0.0.1:1/stream.mjpeg',
      helperBaseUrl: 'http://127.0.0.1:1',
      controlUrl: null,
      helperStartedByOrkestrai: true,
      touchedAt: Date.now(),
    };
  }
  async stop() { this.stopped += 1; }
  async health() { return true; }
  async command(
    _session: DeviceRuntimeSession,
    input: Exclude<DeviceCommandInput, { command: 'start' | 'stop' }>,
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
});
