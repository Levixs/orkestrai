import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type {
  DeviceCommandInput,
  DeviceCommandResponse,
  DeviceCommandResult,
  DevicePlatform,
  DeviceSnapshot,
} from '../../contracts/schemas/device.schema.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { AndroidDeviceAdapter } from '../adapters/devices/AndroidDeviceAdapter.js';
import { IosSimulatorAdapter } from '../adapters/devices/IosSimulatorAdapter.js';
import type { DeviceAdapter, DeviceRuntimeSession } from '../adapters/devices/types.js';

const IDLE_TIMEOUT_MS = 15 * 60_000;

type DeviceGlobal = typeof globalThis & {
  __orkestraiDeviceService?: DeviceService;
  __orkestraiShutdownDevices?: () => Promise<void>;
  __orkestraiStopWorkspaceDevice?: (workspaceId: string) => Promise<void>;
  __orkestraiBroadcast?: (payload: Record<string, unknown>) => void;
};

function broadcast(workspaceId: string): void {
  (globalThis as DeviceGlobal).__orkestraiBroadcast?.({ type: 'deviceChanged', workspaceId });
}

export class DeviceService {
  private readonly adapters: Map<DevicePlatform, DeviceAdapter>;
  private readonly sessions = new Map<string, DeviceRuntimeSession>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(adapters: DeviceAdapter[] = [new IosSimulatorAdapter(), new AndroidDeviceAdapter()]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.platform, adapter]));
    this.cleanupTimer = setInterval(() => void this.stopIdleSessions(), 60_000);
    this.cleanupTimer.unref?.();
    (globalThis as DeviceGlobal).__orkestraiShutdownDevices = () => this.stopAll();
    (globalThis as DeviceGlobal).__orkestraiStopWorkspaceDevice = (workspaceId) => this.stop(workspaceId);
  }

  async snapshot(workspaceId: string, touch = true): Promise<DeviceSnapshot> {
    await this.requireWorkspace(workspaceId);
    const session = this.sessions.get(workspaceId) ?? null;
    if (session && touch) session.touchedAt = Date.now();
    const adapters = [...this.adapters.values()];
    const [platforms, deviceGroups] = await Promise.all([
      Promise.all(adapters.map((adapter) => adapter.availability())),
      Promise.all(adapters.map((adapter) => adapter.list().catch(() => []))),
    ]);
    return {
      platforms,
      devices: deviceGroups.flat(),
      session: session?.public ?? null,
    };
  }

  async execute(workspaceId: string, input: DeviceCommandInput): Promise<DeviceCommandResponse> {
    const workspace = await this.requireWorkspace(workspaceId);
    let result: DeviceCommandResult | null = null;
    if (input.command === 'start') {
      await this.start(workspaceId, input.platform, input.deviceId);
    } else if (input.command === 'stop') {
      await this.stop(workspaceId);
    } else {
      const session = this.requireSession(workspaceId);
      const adapter = this.requireAdapter(session.public.platform);
      session.touchedAt = Date.now();
      const command = input.command === 'install'
        ? { ...input, path: await this.safeWorkspacePath(workspace.workingDir, input.path) }
        : input;
      result = await adapter.command(session, command, {
        workspaceRoot: workspace.workingDir,
        screenshotDirectory: join(workspace.workingDir, '.orkestrai', 'devices', 'screenshots'),
      });
      broadcast(workspaceId);
    }
    return { snapshot: await this.snapshot(workspaceId), result };
  }

  async stream(workspaceId: string, signal?: AbortSignal): Promise<Response> {
    await this.requireWorkspace(workspaceId);
    const session = this.requireSession(workspaceId);
    session.touchedAt = Date.now();
    const response = await fetch(session.streamUrl, { signal });
    if (!response.ok || !response.body) throw new Error(`Device stream unavailable (HTTP ${response.status}).`);
    return new Response(response.body, {
      status: 200,
      headers: {
        'content-type': response.headers.get('content-type') ?? 'multipart/x-mixed-replace; boundary=frame',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  async start(workspaceId: string, platform: DevicePlatform, deviceId: string): Promise<void> {
    await this.requireWorkspace(workspaceId);
    const adapter = this.requireAdapter(platform);
    const availability = await adapter.availability();
    if (!availability.available) throw new Error(`Device backend unavailable: ${availability.reason}.`);
    const device = (await adapter.list()).find((candidate) => candidate.id === deviceId);
    if (!device?.available) throw new Error('The selected device is no longer available.');

    for (const [ownerWorkspaceId, active] of this.sessions) {
      if (ownerWorkspaceId === workspaceId || active.public.deviceId === deviceId) {
        await this.stop(ownerWorkspaceId);
      }
    }

    const session = await adapter.start(workspaceId, device);
    this.sessions.set(workspaceId, session);
    broadcast(workspaceId);
  }

  async stop(workspaceId: string): Promise<void> {
    const session = this.sessions.get(workspaceId);
    if (!session) return;
    this.sessions.delete(workspaceId);
    await this.requireAdapter(session.public.platform).stop(session);
    broadcast(workspaceId);
  }

  async stopAll(): Promise<void> {
    const workspaceIds = [...this.sessions.keys()];
    await Promise.all(workspaceIds.map((workspaceId) => this.stop(workspaceId).catch(() => undefined)));
  }

  private async stopIdleSessions(): Promise<void> {
    const cutoff = Date.now() - IDLE_TIMEOUT_MS;
    for (const [workspaceId, session] of this.sessions) {
      if (session.touchedAt < cutoff) await this.stop(workspaceId).catch(() => undefined);
    }
  }

  private requireSession(workspaceId: string): DeviceRuntimeSession {
    const session = this.sessions.get(workspaceId);
    if (!session) throw new Error('No device is attached to this workspace.');
    if (session.public.status !== 'streaming') throw new Error(session.public.lastError ?? 'The device stream is not ready.');
    return session;
  }

  private requireAdapter(platform: DevicePlatform): DeviceAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) throw new Error(`Unsupported device platform: ${platform}.`);
    return adapter;
  }

  private async requireWorkspace(workspaceId: string) {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace not found.');
    return workspace;
  }

  private async safeWorkspacePath(rootInput: string, pathInput: string): Promise<string> {
    const root = await realpath(resolve(rootInput));
    const candidate = await realpath(isAbsolute(pathInput) ? resolve(pathInput) : resolve(root, pathInput));
    const distance = relative(root, candidate);
    if (distance === '..' || distance.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(distance)) {
      throw new Error('Device install paths must stay inside the workspace.');
    }
    return candidate;
  }
}

const deviceGlobal = globalThis as DeviceGlobal;
export const deviceService = (deviceGlobal.__orkestraiDeviceService ??= new DeviceService());
