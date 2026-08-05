import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpMarketService } from '$lib/modules/agent-room/application/services/McpMarketService.js';
import { mcpService } from '$lib/modules/agent-room/application/services/McpService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

const fakeRegistryFetch = async (url: RequestInfo | URL) => {
  expect(String(url)).toContain('registry.modelcontextprotocol.io/v0/servers?search=');
  return new Response(
    JSON.stringify({
      servers: [
        {
          server: {
            name: 'com.example/remote-mcp',
            title: 'Remote MCP',
            description: 'Servidor remoto de teste',
            remotes: [{ type: 'streamable-http', url: 'https://mcp.example.com' }],
          },
          _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } },
        },
        {
          server: {
            name: 'com.example/npm-mcp',
            description: 'Servidor npm de teste',
            packages: [{ registryType: 'npm', identifier: '@example/mcp', environmentVariables: [{ name: 'EXAMPLE_KEY', description: 'Chave de exemplo', isRequired: true }] }],
          },
          _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } },
        },
      ],
    })
  );
};

describe('McpMarketService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('sem busca devolve a curadoria completa', async () => {
    const service = new McpMarketService(fakeRegistryFetch as typeof fetch);
    const results = await service.search('');
    expect(results.length).toBeGreaterThanOrEqual(10);
    expect(results.every((entry) => entry.source === 'curadoria')).toBe(true);
    expect(results.some((entry) => entry.key === 'github')).toBe(true);
    expect(results.some((entry) => entry.url)).toBe(true); // entradas de 1 clique
  });

  it('com busca: curadoria filtrada primeiro + registry sem duplicar', async () => {
    const service = new McpMarketService(fakeRegistryFetch as typeof fetch);
    const results = await service.search('github');
    expect(results[0].source).toBe('curadoria');
    expect(results[0].key).toBe('github');
    // registry mapeia remoto (url) e npm (npx + envs)
    const remote = results.find((entry) => entry.title === 'Remote MCP');
    expect(remote?.url).toBe('https://mcp.example.com');
    const npm = results.find((entry) => entry.description === 'Servidor npm de teste');
    expect(npm?.command).toBe('npx');
    expect(npm?.args).toEqual(['-y', '@example/mcp']);
    expect(npm?.envs?.[0]).toMatchObject({ key: 'EXAMPLE_KEY', required: true });
  });

  it('registry fora do ar: curadoria continua funcionando', async () => {
    const service = new McpMarketService((async () => {
      throw new Error('offline');
    }) as typeof fetch);
    const results = await service.search('github');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe('curadoria');
  });

  it('install exige env obrigatorio e grava remoto como type http', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-mcp-market-'));
    const workspace = await workspaceRepository.createWorkspace({ name: 'market', workingDir: dir });
    const service = new McpMarketService(fakeRegistryFetch as typeof fetch);

    const github = service.curated().find((entry) => entry.key === 'github')!;
    await expect(service.install(workspace.id, github, {})).rejects.toThrow('Preencha');

    await service.install(workspace.id, github, { GITHUB_PERSONAL_ACCESS_TOKEN: 'tok123' });
    const deepwiki = service.curated().find((entry) => entry.key === 'deepwiki')!;
    await service.install(workspace.id, deepwiki, {});

    const onDisk = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'));
    expect(onDisk.mcpServers.github).toMatchObject({ command: 'npx', env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'tok123' } });
    expect(onDisk.mcpServers.deepwiki).toMatchObject({ type: 'http', url: 'https://mcp.deepwiki.com/mcp' });

    const servers = await mcpService.list(workspace.id);
    expect(servers.find((server) => server.name === 'github')?.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('tok123');
    expect(servers.find((server) => server.name === 'deepwiki')?.url).toBe('https://mcp.deepwiki.com/mcp');
  });
});
