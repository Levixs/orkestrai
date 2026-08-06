import { describe, expect, it, vi } from 'vitest';
import {
  ManagedPortService,
  parseLsofListeners,
  parseSsListeners,
  parseWindowsListeners,
} from '$lib/modules/agent-room/application/services/ManagedPortService.js';
import type { CanvasNode, Workspace } from '$lib/modules/agent-room/domain/types.js';

const workspace: Workspace = {
  id: 'ws-1',
  name: 'App',
  workingDir: '/tmp/app',
  icon: null,
  instructions: null,
  syncAgentInstructionFiles: false,
  hooks: {},
  createdAt: '2026-08-06T00:00:00.000Z',
  updatedAt: '2026-08-06T00:00:00.000Z',
};

function node(id: string, title: string, url: string): CanvasNode {
  return {
    id,
    workspaceId: workspace.id,
    type: 'portal',
    title,
    x: 0,
    y: 0,
    width: 500,
    height: 320,
    zIndex: 0,
    payload: { url },
    floorId: null,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

function repository(nodes: CanvasNode[]) {
  return {
    getWorkspace: vi.fn(async (id: string) => id === workspace.id ? workspace : null),
    listNodes: vi.fn(async () => nodes),
  };
}

describe('listener parsers', () => {
  it('parses lsof field output on macOS and Unix', () => {
    expect(parseLsofListeners('p120\ncnode\nn*:4173\np222\ncpython\nn127.0.0.1:8000 (LISTEN)\n')).toEqual([
      { port: 4173, pid: 120, command: 'node' },
      { port: 8000, pid: 222, command: 'python' },
    ]);
  });

  it('parses ss output on Linux', () => {
    const output = 'LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=431,fd=20))';
    expect(parseSsListeners(output)).toEqual([{ port: 5173, pid: 431, command: 'node' }]);
  });

  it('parses PowerShell JSON on Windows', () => {
    expect(parseWindowsListeners('[{"port":3000,"pid":72,"command":"node"}]')).toEqual([
      { port: 3000, pid: 72, command: 'node' },
    ]);
  });
});

describe('ManagedPortService', () => {
  it('lists only ports linked to local Portal nodes and groups shared ports', async () => {
    const repo = repository([
      node('p1', 'Frontend', 'localhost:4173'),
      node('p2', 'Preview', 'http://127.0.0.1:4173/preview'),
      node('p3', 'Production', 'https://example.com'),
    ]);
    const runCommand = vi.fn(async () => 'p120\ncnode\nn*:4173\np222\ncother\nn*:9000\n');
    const service = new ManagedPortService({ repository: repo, runCommand, currentPid: 900, parentPid: 899 });

    await expect(service.list(workspace.id)).resolves.toEqual([
      {
        port: 4173,
        host: 'localhost',
        status: 'listening',
        pids: [120],
        commands: ['node'],
        portals: [
          { nodeId: 'p1', title: 'Frontend', url: 'http://localhost:4173/' },
          { nodeId: 'p2', title: 'Preview', url: 'http://127.0.0.1:4173/preview' },
        ],
        protected: false,
      },
    ]);
    expect(repo.listNodes).toHaveBeenCalledWith(workspace.id);
  });

  it('terminates only the PID that still owns the managed port', async () => {
    const killProcess = vi.fn();
    const service = new ManagedPortService({
      repository: repository([node('p1', 'Frontend', 'http://localhost:4173')]),
      runCommand: vi.fn(async () => 'p120\ncnode\nn*:4173\n'),
      killProcess,
      currentPid: 900,
      parentPid: 899,
      wait: async () => {},
    });

    await expect(service.kill(workspace.id, 4173, [120])).resolves.toEqual({ port: 4173, killedPids: [120] });
    expect(killProcess).toHaveBeenCalledOnce();
    expect(killProcess).toHaveBeenCalledWith(120, 'SIGTERM');
  });

  it('refuses a stale PID snapshot and protects the Orkestrai process', async () => {
    const changingCommand = vi
      .fn()
      .mockResolvedValueOnce('p120\ncnode\nn*:4173\n')
      .mockResolvedValueOnce('p121\ncnode\nn*:4173\n');
    const repo = repository([node('p1', 'Frontend', 'http://localhost:4173')]);
    const changing = new ManagedPortService({ repository: repo, runCommand: changingCommand, currentPid: 900, parentPid: 899 });
    const snapshot = await changing.list(workspace.id);

    await expect(changing.kill(workspace.id, 4173, snapshot[0].pids)).rejects.toThrow('processo desta porta mudou');

    const protectedService = new ManagedPortService({
      repository: repo,
      runCommand: vi.fn(async () => 'p900\ncorkestrai\nn*:4173\n'),
      currentPid: 900,
      parentPid: 899,
    });
    await expect(protectedService.kill(workspace.id, 4173, [900])).rejects.toThrow('servidor do Orkestrai');
  });
});
