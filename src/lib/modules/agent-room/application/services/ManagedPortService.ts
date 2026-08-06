import { execFile } from 'node:child_process';
import type { CanvasNode, Workspace } from '$lib/modules/agent-room/domain/types.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

export type ManagedPortalRef = {
  nodeId: string;
  title: string;
  url: string;
};

export type ManagedPort = {
  port: number;
  host: string;
  status: 'listening' | 'offline';
  pids: number[];
  commands: string[];
  portals: ManagedPortalRef[];
  protected: boolean;
};

export type ManagedPortErrorCode =
  | 'workspace_not_found'
  | 'port_not_managed'
  | 'protected_process'
  | 'port_offline'
  | 'stale_process';

export class ManagedPortError extends Error {
  constructor(public readonly code: ManagedPortErrorCode, message: string) {
    super(message);
    this.name = 'ManagedPortError';
  }
}

type Listener = { port: number; pid: number; command: string };
type Platform = NodeJS.Platform;
type Signal = NodeJS.Signals | 0;
type RunCommand = (command: string, args: string[]) => Promise<string>;
type KillProcess = (pid: number, signal: Signal) => void;
type ManagedPortRepository = {
  getWorkspace: (id: string) => Promise<Workspace | null>;
  listNodes: (workspaceId: string) => Promise<CanvasNode[]>;
};

export type ManagedPortServiceOptions = {
  platform?: Platform;
  runCommand?: RunCommand;
  killProcess?: KillProcess;
  currentPid?: number;
  parentPid?: number;
  wait?: (ms: number) => Promise<void>;
  repository?: ManagedPortRepository;
};

function commandOutput(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: 'utf8', timeout: 10_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error) {
          Object.assign(error, { stdout: String(stdout ?? '') });
          reject(error);
          return;
        }
        resolve(String(stdout ?? ''));
      }
    );
  });
}

function portAtEnd(address: string): number | null {
  const match = address.match(/:(\d+)$/);
  const port = Number(match?.[1]);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null;
}

export function parseLsofListeners(output: string): Listener[] {
  const listeners: Listener[] = [];
  let pid: number | null = null;
  let command = '';
  for (const line of output.split(/\r?\n/)) {
    const field = line[0];
    const value = line.slice(1).trim();
    if (field === 'p') {
      pid = Number(value);
      command = '';
    } else if (field === 'c') {
      command = value;
    } else if (field === 'n' && pid && pid > 1) {
      const port = portAtEnd(value.replace(/\s+\(LISTEN\)$/i, ''));
      if (port) listeners.push({ port, pid, command: command || 'process' });
    }
  }
  return listeners;
}

export function parseSsListeners(output: string): Listener[] {
  const listeners: Listener[] = [];
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    const localAddress = columns[3] ?? '';
    const port = portAtEnd(localAddress);
    const processMatch = line.match(/users:\(\(\"([^\"]+)\",pid=(\d+)/);
    const pid = Number(processMatch?.[2]);
    if (port && pid > 1) listeners.push({ port, pid, command: processMatch?.[1] || 'process' });
  }
  return listeners;
}

export function parseWindowsListeners(output: string): Listener[] {
  if (!output.trim()) return [];
  const parsed = JSON.parse(output) as
    | { port?: number; pid?: number; command?: string }
    | Array<{ port?: number; pid?: number; command?: string }>;
  return (Array.isArray(parsed) ? parsed : [parsed])
    .map((row) => ({ port: Number(row.port), pid: Number(row.pid), command: String(row.command ?? 'process') }))
    .filter((row) => Number.isInteger(row.port) && row.port > 0 && row.port <= 65_535 && row.pid > 1);
}

function localPortalTarget(rawUrl: string): { host: string; port: number; url: string } | null {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`);
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host)) return null;
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
    return { host, port, url: url.toString() };
  } catch {
    return null;
  }
}

/**
 * Inspeciona somente portas referenciadas por nos Portal locais do workspace.
 * Nunca oferece listeners arbitrarios da maquina: a associacao persistida no
 * canvas e a fronteira que torna o encerramento seguro entre workspaces.
 */
export class ManagedPortService {
  private readonly platform: Platform;
  private readonly runCommand: RunCommand;
  private readonly killProcess: KillProcess;
  private readonly currentPid: number;
  private readonly parentPid: number;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly repository: ManagedPortRepository;

  constructor(options: ManagedPortServiceOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.runCommand = options.runCommand ?? commandOutput;
    this.killProcess = options.killProcess ?? ((pid, signal) => process.kill(pid, signal));
    this.currentPid = options.currentPid ?? process.pid;
    this.parentPid = options.parentPid ?? process.ppid;
    this.wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.repository = options.repository ?? workspaceRepository;
  }

  async list(workspaceId: string): Promise<ManagedPort[]> {
    const workspace = await this.repository.getWorkspace(workspaceId);
    if (!workspace) throw new ManagedPortError('workspace_not_found', 'Workspace nao encontrado.');
    const nodes = await this.repository.listNodes(workspaceId);
    const byPort = new Map<number, { host: string; portals: ManagedPortalRef[] }>();
    for (const node of nodes) {
      if (node.type !== 'portal') continue;
      const rawUrl = String((node.payload as { url?: string }).url ?? '').trim();
      const target = localPortalTarget(rawUrl);
      if (!target) continue;
      const entry = byPort.get(target.port) ?? { host: target.host, portals: [] };
      entry.portals.push({ nodeId: node.id, title: node.title || `Portal :${target.port}`, url: target.url });
      byPort.set(target.port, entry);
    }

    if (!byPort.size) return [];
    const listeners = await this.inspectListeners();
    return [...byPort.entries()]
      .map(([port, entry]) => {
        const matches = listeners.filter((listener) => listener.port === port);
        const pids = [...new Set(matches.map((listener) => listener.pid))].sort((a, b) => a - b);
        const commands = [...new Set(matches.map((listener) => listener.command).filter(Boolean))];
        return {
          port,
          host: entry.host,
          status: pids.length ? 'listening' as const : 'offline' as const,
          pids,
          commands,
          portals: entry.portals,
          protected: pids.includes(this.currentPid) || pids.includes(this.parentPid),
        };
      })
      .sort((a, b) => Number(b.status === 'listening') - Number(a.status === 'listening') || a.port - b.port);
  }

  async kill(workspaceId: string, port: number, expectedPids: number[]): Promise<{ port: number; killedPids: number[] }> {
    const managed = (await this.list(workspaceId)).find((entry) => entry.port === port);
    if (!managed) throw new ManagedPortError('port_not_managed', 'Esta porta nao pertence a um Portal local deste workspace.');
    if (managed.protected) throw new ManagedPortError('protected_process', 'O servidor do Orkestrai nao pode ser encerrado por este painel.');
    if (managed.status !== 'listening' || !managed.pids.length) throw new ManagedPortError('port_offline', 'A porta ja esta livre. Atualize a lista.');
    const expected = [...new Set(expectedPids)].sort((a, b) => a - b);
    if (JSON.stringify(expected) !== JSON.stringify(managed.pids)) {
      throw new ManagedPortError('stale_process', 'O processo desta porta mudou. Atualize a lista antes de encerrar.');
    }

    for (const pid of managed.pids) await this.terminate(pid);
    await this.wait(180);
    return { port, killedPids: managed.pids };
  }

  private async inspectListeners(): Promise<Listener[]> {
    if (this.platform === 'win32') {
      const script = [
        '$rows = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object {',
        '  $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue;',
        '  [PSCustomObject]@{ port = [int]$_.LocalPort; pid = [int]$_.OwningProcess; command = if ($proc) { $proc.ProcessName } else { "process" } }',
        '};',
        '@($rows) | ConvertTo-Json -Compress',
      ].join(' ');
      return parseWindowsListeners(await this.runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]));
    }

    try {
      return parseLsofListeners(await this.runCommand('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn']));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return parseLsofListeners(String((error as { stdout?: string }).stdout ?? ''));
      if (this.platform !== 'linux') throw error;
      return parseSsListeners(await this.runCommand('ss', ['-ltnpH']));
    }
  }

  private async terminate(pid: number): Promise<void> {
    if (pid <= 1 || pid === this.currentPid || pid === this.parentPid) {
      throw new ManagedPortError('protected_process', 'Processo protegido.');
    }
    if (this.platform === 'win32') {
      await this.runCommand('taskkill.exe', ['/PID', String(pid), '/F']);
      return;
    }
    try {
      this.killProcess(pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
}

export const managedPortService = new ManagedPortService();
