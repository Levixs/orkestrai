import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AdbServerClient } from '@yume-chan/adb';
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp';
import { XMLParser } from 'fast-xml-parser';
import type {
  DeviceDescriptor,
  DevicePermission,
  DeviceRuntimeState,
} from '../../../contracts/schemas/device.schema.js';

const TEXT_BUFFER_LIMIT = 4 * 1024 * 1024;
const SCREENSHOT_BUFFER_LIMIT = 24 * 1024 * 1024;
const AVD_PREFIX = 'avd:';

type CommandResult<T extends string | Buffer> = {
  stdout: T;
  stderr: T;
};

type ConnectedAndroidDevice = {
  serial: string;
  state: 'unauthorized' | 'offline' | 'device';
  model?: string;
};

const permissionMap: Record<DevicePermission, string[]> = {
  notifications: ['android.permission.POST_NOTIFICATIONS'],
  location: ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'],
  camera: ['android.permission.CAMERA'],
  microphone: ['android.permission.RECORD_AUDIO'],
  photos: ['android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_EXTERNAL_STORAGE'],
  'photos-add': ['android.permission.WRITE_EXTERNAL_STORAGE'],
  contacts: ['android.permission.READ_CONTACTS', 'android.permission.WRITE_CONTACTS'],
  calendar: ['android.permission.READ_CALENDAR', 'android.permission.WRITE_CALENDAR'],
  reminders: [],
  motion: ['android.permission.ACTIVITY_RECOGNITION'],
  'media-library': ['android.permission.READ_MEDIA_AUDIO', 'android.permission.READ_EXTERNAL_STORAGE'],
  siri: [],
  speech: ['android.permission.RECORD_AUDIO'],
  faceid: ['android.permission.USE_BIOMETRIC'],
  'user-tracking': [],
  homekit: [],
  all: [
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.READ_MEDIA_AUDIO',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.READ_CONTACTS',
    'android.permission.WRITE_CONTACTS',
    'android.permission.READ_CALENDAR',
    'android.permission.WRITE_CALENDAR',
    'android.permission.ACTIVITY_RECOGNITION',
    'android.permission.USE_BIOMETRIC',
  ],
};

function command<T extends string | Buffer>(
  executable: string,
  args: string[],
  options: { timeout?: number; maxBuffer?: number; buffer?: boolean } = {},
): Promise<CommandResult<T>> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    let settled = false;
    const maxBuffer = options.maxBuffer ?? TEXT_BUFFER_LIMIT;
    const timeout = options.timeout
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill();
          reject(new Error(`${executable} timed out.`));
        }, options.timeout)
      : null;
    timeout?.unref?.();

    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBuffer && !settled) {
        settled = true;
        child.kill();
        if (timeout) clearTimeout(timeout);
        reject(new Error(`${executable} exceeded the output limit.`));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      const stdoutBuffer = Buffer.concat(stdout);
      const stderrBuffer = Buffer.concat(stderr);
      if (code !== 0) {
        reject(new Error(stderrBuffer.toString('utf8').trim() || `${executable} exited with code ${code}.`));
        return;
      }
      if (options.buffer) {
        resolve({ stdout: stdoutBuffer, stderr: stderrBuffer } as CommandResult<T>);
      } else {
        resolve({
          stdout: stdoutBuffer.toString('utf8'),
          stderr: stderrBuffer.toString('utf8'),
        } as CommandResult<T>);
      }
    });
  });
}

function runtimeState(state: ConnectedAndroidDevice['state']): DeviceRuntimeState {
  if (state === 'device') return 'booted';
  if (state === 'unauthorized') return 'unauthorized';
  return 'offline';
}

function prettyModel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export class AndroidSdk {
  private adbPathPromise: Promise<string | null> | null = null;
  private emulatorPathPromise: Promise<string | null> | null = null;
  private listCache: { at: number; devices: DeviceDescriptor[] } | null = null;

  async adbPath(): Promise<string | null> {
    return (this.adbPathPromise ??= this.resolveTool('adb', ['version']));
  }

  async emulatorPath(): Promise<string | null> {
    return (this.emulatorPathPromise ??= this.resolveTool('emulator', ['-version']));
  }

  async ensureAdbServer(): Promise<string> {
    const adb = await this.adbPath();
    if (!adb) throw new Error('Android SDK Platform Tools were not found.');
    await command<string>(adb, ['start-server'], { timeout: 10_000 });
    return adb;
  }

  async listDevices(force = false): Promise<DeviceDescriptor[]> {
    if (!force && this.listCache && Date.now() - this.listCache.at < 1_500) {
      return this.listCache.devices;
    }
    await this.ensureAdbServer();
    const [connected, avds] = await Promise.all([
      this.connectedDevices(),
      this.listAvds(),
    ]);
    const connectedDescriptors = await Promise.all(connected.map((device) => this.describeConnected(device)));
    const runningAvdNames = new Set(
      connectedDescriptors
        .filter((device) => !device.physical && device.runtime?.startsWith('AVD '))
        .map((device) => device.runtime!.slice(4)),
    );
    const stoppedAvds: DeviceDescriptor[] = avds
      .filter((name) => !runningAvdNames.has(name))
      .map((name) => ({
        id: `${AVD_PREFIX}${name}`,
        name: prettyModel(name),
        platform: 'android',
        runtime: `AVD ${name}`,
        state: 'shutdown',
        available: true,
        physical: false,
      }));
    const devices = [...connectedDescriptors, ...stoppedAvds].sort((left, right) => {
      if (left.state === 'booted' && right.state !== 'booted') return -1;
      if (left.state !== 'booted' && right.state === 'booted') return 1;
      if (left.physical !== right.physical) return left.physical ? 1 : -1;
      return left.name.localeCompare(right.name);
    });
    this.listCache = { at: Date.now(), devices };
    return devices;
  }

  async attach(device: DeviceDescriptor): Promise<{ serial: string; startedByOrkestrai: boolean }> {
    if (!device.id.startsWith(AVD_PREFIX)) {
      await this.waitForBoot(device.id, 30_000);
      return { serial: device.id, startedByOrkestrai: false };
    }
    const avdName = device.id.slice(AVD_PREFIX.length);
    const emulator = await this.emulatorPath();
    if (!emulator) throw new Error('Android Emulator was not found in the Android SDK.');
    const child = spawn(emulator, ['-avd', avdName], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    try {
      const serial = await this.waitForAvd(avdName, 180_000);
      await this.waitForBoot(serial, 180_000);
      this.listCache = null;
      return { serial, startedByOrkestrai: true };
    } catch (error) {
      child.kill();
      throw error;
    }
  }

  async shutdown(serial: string): Promise<void> {
    await this.runAdb(serial, ['emu', 'kill'], 20_000).catch(() => undefined);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const connected = await this.connectedDevices().catch(() => []);
      if (!connected.some((device) => device.serial === serial)) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
    this.listCache = null;
  }

  async install(serial: string, path: string): Promise<void> {
    if (!path.toLowerCase().endsWith('.apk')) throw new Error('Android install expects an APK file.');
    await this.runAdb(serial, ['install', '-r', path], 180_000);
  }

  async launch(serial: string, target: string): Promise<void> {
    if (target.includes('/')) {
      await this.runAdb(serial, ['shell', 'am', 'start', '-n', target], 60_000);
    } else {
      await this.runAdb(serial, ['shell', 'monkey', '-p', target, '-c', 'android.intent.category.LAUNCHER', '1'], 60_000);
    }
  }

  async screenshot(serial: string, path: string): Promise<void> {
    const data = await this.runAdbBuffer(serial, ['exec-out', 'screencap', '-p'], 30_000);
    await writeFile(path, data);
  }

  async logs(serial: string, minutes: number): Promise<string> {
    return this.runAdb(serial, ['logcat', '-d', '-T', `${minutes}m`], 30_000);
  }

  async accessibilityTree(serial: string): Promise<unknown> {
    const remotePath = `/data/local/tmp/orkestrai-window-${Date.now()}.xml`;
    try {
      await this.runAdb(serial, ['shell', 'uiautomator', 'dump', '--compressed', remotePath], 30_000);
      const xml = await this.runAdb(serial, ['exec-out', 'cat', remotePath], 30_000);
      return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(xml);
    } finally {
      await this.runAdb(serial, ['shell', 'rm', '-f', remotePath], 10_000).catch(() => undefined);
    }
  }

  async permissions(
    serial: string,
    action: 'list' | 'grant' | 'revoke' | 'reset',
    packageName?: string,
    permission?: DevicePermission,
  ): Promise<string> {
    if (action === 'list') {
      return packageName
        ? this.runAdb(serial, ['shell', 'dumpsys', 'package', packageName], 30_000)
        : this.runAdb(serial, ['shell', 'pm', 'list', 'permissions', '-g', '-d'], 30_000);
    }
    if (!packageName || !permission) throw new Error('Android permission changes require a package and permission.');
    const androidPermissions = permissionMap[permission];
    if (!androidPermissions.length) throw new Error('The selected permission does not have an Android equivalent.');
    const operation = action === 'grant' ? 'grant' : 'revoke';
    const results = await Promise.all(androidPermissions.map(async (androidPermission) => {
      try {
        const output = await this.runAdb(serial, ['shell', 'pm', operation, packageName, androidPermission], 20_000);
        return `${androidPermission}: ${output || operation}`;
      } catch (error) {
        return `${androidPermission}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }));
    if (action === 'reset') {
      await this.runAdb(serial, [
        'shell', 'pm', 'clear-permission-flags', packageName,
        androidPermissions[0]!, 'user-set', 'user-fixed',
      ], 20_000).catch(() => undefined);
    }
    return results.join('\n');
  }

  async runAdb(serial: string, args: string[], timeout = 30_000): Promise<string> {
    const adb = await this.ensureAdbServer();
    const { stdout } = await command<string>(adb, ['-s', serial, ...args], {
      timeout,
      maxBuffer: TEXT_BUFFER_LIMIT,
    });
    return stdout.trim();
  }

  private async runAdbBuffer(serial: string, args: string[], timeout: number): Promise<Buffer> {
    const adb = await this.ensureAdbServer();
    const { stdout } = await command<Buffer>(adb, ['-s', serial, ...args], {
      timeout,
      maxBuffer: SCREENSHOT_BUFFER_LIMIT,
      buffer: true,
    });
    return stdout;
  }

  private async connectedDevices(): Promise<ConnectedAndroidDevice[]> {
    const client = new AdbServerClient(new AdbServerNodeTcpConnector({
      host: process.env.ANDROID_ADB_SERVER_ADDRESS ?? '127.0.0.1',
      port: Number(process.env.ANDROID_ADB_SERVER_PORT ?? 5037),
    }));
    return (await client.getDevices(['unauthorized', 'offline', 'device'])).map((device) => ({
      serial: device.serial,
      state: device.state,
      model: device.model,
    }));
  }

  private async describeConnected(device: ConnectedAndroidDevice): Promise<DeviceDescriptor> {
    const physical = !device.serial.startsWith('emulator-');
    if (device.state !== 'device') {
      return {
        id: device.serial,
        name: prettyModel(device.model || device.serial),
        platform: 'android',
        runtime: physical ? 'Android device' : 'Android Emulator',
        state: runtimeState(device.state),
        available: false,
        physical,
      };
    }
    const [release, api, model, avdName] = await Promise.all([
      this.runAdb(device.serial, ['shell', 'getprop', 'ro.build.version.release']).catch(() => ''),
      this.runAdb(device.serial, ['shell', 'getprop', 'ro.build.version.sdk']).catch(() => ''),
      this.runAdb(device.serial, ['shell', 'getprop', 'ro.product.model']).catch(() => device.model || ''),
      physical ? Promise.resolve('') : this.avdName(device.serial),
    ]);
    const runtime = physical
      ? `Android ${release || '?'}${api ? ` · API ${api}` : ''}`
      : `AVD ${avdName || device.serial}`;
    return {
      id: device.serial,
      name: prettyModel(avdName || model || device.model || device.serial),
      platform: 'android',
      runtime,
      state: 'booted',
      available: true,
      physical,
    };
  }

  private async listAvds(): Promise<string[]> {
    const emulator = await this.emulatorPath();
    if (!emulator) return [];
    const { stdout } = await command<string>(emulator, ['-list-avds'], { timeout: 10_000 });
    return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  private async avdName(serial: string): Promise<string> {
    const output = await this.runAdb(serial, ['emu', 'avd', 'name'], 10_000).catch(() => '');
    return output.split(/\r?\n/).find((line) => line.trim() && line.trim() !== 'OK')?.trim() ?? '';
  }

  private async waitForAvd(avdName: string, timeoutMs: number): Promise<string> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const connected = await this.connectedDevices().catch(() => []);
      for (const device of connected) {
        if (device.state !== 'device' || !device.serial.startsWith('emulator-')) continue;
        if (await this.avdName(device.serial) === avdName) return device.serial;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error(`Android Emulator ${avdName} did not appear in ADB.`);
  }

  private async waitForBoot(serial: string, timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const booted = await this.runAdb(serial, ['shell', 'getprop', 'sys.boot_completed'], 5_000).catch(() => '');
      if (booted.trim() === '1') return;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error(`Android device ${serial} did not finish booting.`);
  }

  private async resolveTool(tool: 'adb' | 'emulator', versionArgs: string[]): Promise<string | null> {
    const executable = process.platform === 'win32' ? `${tool}.exe` : tool;
    try {
      await command<string>(executable, versionArgs, { timeout: 5_000 });
      return executable;
    } catch {
      // Search the standard Android Studio SDK locations next.
    }
    const home = homedir();
    const roots = unique([
      process.env.ANDROID_SDK_ROOT,
      process.env.ANDROID_HOME,
      process.platform === 'darwin' ? join(home, 'Library', 'Android', 'sdk') : undefined,
      process.platform === 'linux' ? join(home, 'Android', 'Sdk') : undefined,
      process.platform === 'win32' && process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
        : undefined,
      process.platform === 'win32' ? join(home, 'AppData', 'Local', 'Android', 'Sdk') : undefined,
    ]);
    const folder = tool === 'adb' ? 'platform-tools' : 'emulator';
    for (const root of roots) {
      const candidate = join(root, folder, executable);
      try {
        await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        await command<string>(candidate, versionArgs, { timeout: 5_000 });
        return candidate;
      } catch {
        // Keep checking the remaining SDK roots.
      }
    }
    return null;
  }
}
