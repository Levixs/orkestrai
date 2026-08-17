import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mcpService } from '$lib/modules/agent-room/application/services/McpService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

describe('McpService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('adiciona, lista e remove servidores no .mcp.json (com merge)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-mcp-'));
    // Usuario ja tinha um servidor configurado a mao — nao pode ser cloberado.
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { filesystem: { command: 'npx', args: ['-y', '@mcp/fs'] } } }));
    const workspace = await workspaceRepository.createWorkspace({ name: 'mcp', workingDir: dir });

    await mcpService.add(workspace.id, { name: 'web', command: 'uvx', args: 'mcp-web --fast' });
    let servers = await mcpService.list(workspace.id);
    expect(servers.map((server) => server.name).sort()).toEqual(['filesystem', 'web']);
    expect(servers.find((server) => server.name === 'web')?.args).toEqual(['mcp-web', '--fast']);

    // JSON valido e com os dois servidores
    const onDisk = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'));
    expect(Object.keys(onDisk.mcpServers).sort()).toEqual(['filesystem', 'web']);

    servers = await mcpService.remove(workspace.id, 'web');
    expect(servers.map((server) => server.name)).toEqual(['filesystem']);
  });

  it('orkestrai e figma gerenciados sao builtin; validacoes de entrada', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-mcp-builtin-'));
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify({ mcpServers: {
      orkestrai: { command: 'orkestrai', args: ['mcp'] },
      figma: { type: 'http', url: 'https://mcp.figma.com/mcp' },
    } }));
    const workspace = await workspaceRepository.createWorkspace({ name: 'builtin', workingDir: dir });

    const servers = await mcpService.list(workspace.id);
    expect(servers.every((server) => server.builtin)).toBe(true);
    await expect(mcpService.remove(workspace.id, 'figma')).rejects.toThrow('gerenciado');

    await expect(mcpService.add(workspace.id, { name: '', command: 'x' })).rejects.toThrow('nome');
    await expect(mcpService.add(workspace.id, { name: 'x', command: '' })).rejects.toThrow('comando');
    await expect(mcpService.add(workspace.id, { name: 'nome com espaco!', command: 'x' })).rejects.toThrow('letras');
    await expect(mcpService.remove(workspace.id, 'inexistente')).rejects.toThrow('nao encontrado');
  });
});
