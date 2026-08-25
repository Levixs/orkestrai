import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fanOutMcpServer, removeFannedOutMcpServer } from '$lib/modules/agent-room/infrastructure/mcp-fanout.js';

describe('mcp-fanout', () => {
  let workingDir: string;

  beforeEach(async () => {
    workingDir = await mkdtemp(join(tmpdir(), 'orkestrai-mcp-fanout-'));
  });

  afterEach(async () => {
    await rm(workingDir, { recursive: true, force: true });
  });

  it('writes a command-based server into every standard JSON path and opencode.json', async () => {
    await fanOutMcpServer(workingDir, 'context7', {
      command: 'npx',
      args: ['-y', 'context7-mcp'],
      env: { API_KEY: 'x' },
    });

    for (const relativePath of [
      '.cursor/mcp.json',
      '.cline/mcp.json',
      '.devin/mcp_config.json',
      '.agents/mcp_config.json',
    ]) {
      const config = JSON.parse(await readFile(join(workingDir, relativePath), 'utf8'));
      expect(config.mcpServers.context7).toEqual({
        command: 'npx',
        args: ['-y', 'context7-mcp'],
        env: { API_KEY: 'x' },
      });
    }

    const opencode = JSON.parse(await readFile(join(workingDir, 'opencode.json'), 'utf8'));
    expect(opencode.mcp.context7).toEqual({
      type: 'local',
      command: ['npx', '-y', 'context7-mcp'],
      environment: { API_KEY: 'x' },
      enabled: true,
    });
  });

  it('writes a remote (url) server as a bare url entry, and as type "remote" for opencode', async () => {
    await fanOutMcpServer(workingDir, 'remote-server', {
      url: 'https://example.com/mcp',
    });

    const cursor = JSON.parse(await readFile(join(workingDir, '.cursor/mcp.json'), 'utf8'));
    expect(cursor.mcpServers['remote-server']).toEqual({
      url: 'https://example.com/mcp',
    });

    const opencode = JSON.parse(await readFile(join(workingDir, 'opencode.json'), 'utf8'));
    expect(opencode.mcp['remote-server']).toEqual({
      type: 'remote',
      url: 'https://example.com/mcp',
      enabled: true,
    });
  });

  it('merges with existing entries instead of overwriting them', async () => {
    await fanOutMcpServer(workingDir, 'first', {
      command: 'npx',
      args: ['first-mcp'],
    });
    await fanOutMcpServer(workingDir, 'second', {
      command: 'npx',
      args: ['second-mcp'],
    });

    const config = JSON.parse(await readFile(join(workingDir, '.cline/mcp.json'), 'utf8'));
    expect(Object.keys(config.mcpServers).sort()).toEqual(['first', 'second']);
  });

  it('removes a fanned-out server from every path without touching siblings', async () => {
    await fanOutMcpServer(workingDir, 'keep', {
      command: 'npx',
      args: ['keep-mcp'],
    });
    await fanOutMcpServer(workingDir, 'drop', {
      command: 'npx',
      args: ['drop-mcp'],
    });

    await removeFannedOutMcpServer(workingDir, 'drop');

    for (const relativePath of [
      '.cursor/mcp.json',
      '.cline/mcp.json',
      '.devin/mcp_config.json',
      '.agents/mcp_config.json',
    ]) {
      const config = JSON.parse(await readFile(join(workingDir, relativePath), 'utf8'));
      expect(config.mcpServers).toHaveProperty('keep');
      expect(config.mcpServers).not.toHaveProperty('drop');
    }
    const opencode = JSON.parse(await readFile(join(workingDir, 'opencode.json'), 'utf8'));
    expect(opencode.mcp).toHaveProperty('keep');
    expect(opencode.mcp).not.toHaveProperty('drop');
  });

  it('removing a server that was never fanned out is a no-op, not an error', async () => {
    await expect(removeFannedOutMcpServer(workingDir, 'never-existed')).resolves.toBeUndefined();
  });

  it('rejects malformed provider JSON without overwriting or partially updating any target', async () => {
    await mkdir(join(workingDir, '.devin'), { recursive: true });
    await writeFile(join(workingDir, '.devin/mcp_config.json'), '{ invalid json');

    await expect(fanOutMcpServer(workingDir, 'context7', { command: 'npx' })).rejects.toThrow(
      'Invalid MCP configuration'
    );

    expect(await readFile(join(workingDir, '.devin/mcp_config.json'), 'utf8')).toBe('{ invalid json');
    await expect(readFile(join(workingDir, '.cursor/mcp.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
