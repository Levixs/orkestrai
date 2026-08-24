import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProviderProfileService } from '$lib/modules/agent-room/application/services/ProviderProfileService.js';
import type { AgentProfileStrategy } from '$lib/modules/agent-room/application/adapters/types.js';
import type { ProviderProfile } from '$lib/modules/agent-room/domain/types.js';
import type {
  CreateProviderProfileInput,
  ProviderProfileRepository,
} from '$lib/modules/agent-room/infrastructure/repositories/ProviderProfileRepository.js';

const STRATEGIES: Record<string, AgentProfileStrategy> = {
  claude: { kind: 'configDir', envVar: 'CLAUDE_CONFIG_DIR', defaultDir: '~/.claude' },
  opencode: {
    kind: 'configDirPair',
    configEnvVar: 'OPENCODE_CONFIG_DIR',
    dataEnvVar: 'XDG_DATA_HOME',
    defaultConfigDir: '~/.config/opencode',
    defaultDataDir: '~/.local/share',
  },
  cline: { kind: 'token', envVar: 'CLINE_API_KEY' },
  antigravity: { kind: 'unsupported' },
};

function fakeRepository(seed: ProviderProfile[] = []): ProviderProfileRepository {
  const rows = [...seed];
  let counter = 0;
  return {
    async list(providerId?: string) {
      return providerId ? rows.filter((row) => row.providerId === providerId) : [...rows];
    },
    async find(id: string) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async findByName(providerId: string, name: string) {
      return rows.find((row) => row.providerId === providerId && row.name === name) ?? null;
    },
    async create(input: CreateProviderProfileInput) {
      const now = new Date().toISOString();
      const row: ProviderProfile = {
        id: `profile-${++counter}`,
        providerId: input.providerId,
        name: input.name,
        configDir: input.configDir,
        dataDir: input.dataDir,
        hasToken: input.hasToken,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(row);
      return row;
    },
    async update(id: string, input: Partial<CreateProviderProfileInput>) {
      const row = rows.find((entry) => entry.id === id);
      if (!row) return null;
      Object.assign(row, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.configDir !== undefined ? { configDir: input.configDir } : {}),
        ...(input.dataDir !== undefined ? { dataDir: input.dataDir } : {}),
        ...(input.hasToken !== undefined ? { hasToken: input.hasToken } : {}),
      });
      return row;
    },
    async delete(id: string) {
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
  } satisfies ProviderProfileRepository;
}

function fakeSecrets() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
  };
}

function service(seed: ProviderProfile[] = []) {
  return new ProviderProfileService({
    repository: fakeRepository(seed),
    secrets: fakeSecrets(),
    adapterProfileStrategy: (providerId) => {
      const strategy = STRATEGIES[providerId];
      if (!strategy) throw new Error(`unknown provider: ${providerId}`);
      return strategy;
    },
  });
}

describe('ProviderProfileService', () => {
  it('creates a configDir profile and resolves its env by the provider strategy', async () => {
    const svc = service();
    const created = await svc.create({ providerId: 'claude', name: 'Trabalho', configDir: '/tmp/claude-trabalho' });
    expect(created.configDir).toBe('/tmp/claude-trabalho');
    expect(created.hasToken).toBe(false);
    await expect(svc.resolveEnv(created.id, 'claude')).resolves.toEqual({ CLAUDE_CONFIG_DIR: '/tmp/claude-trabalho' });
  });

  it('expands a leading ~ at save time, since child processes never expand it themselves', async () => {
    const svc = service();
    const created = await svc.create({ providerId: 'claude', name: 'Trabalho', configDir: '~/.claude-trabalho' });
    expect(created.configDir).toBe(join(homedir(), '.claude-trabalho'));
  });

  it('requires both directories for a configDirPair strategy', async () => {
    const svc = service();
    await expect(svc.create({ providerId: 'opencode', name: 'Trabalho', configDir: '/tmp/opencode-trabalho' }))
      .rejects.toThrow('Informe os dois diretórios');
    const created = await svc.create({
      providerId: 'opencode',
      name: 'Trabalho',
      configDir: '/tmp/opencode-trabalho',
      dataDir: '/tmp/share-trabalho',
    });
    await expect(svc.resolveEnv(created.id, 'opencode')).resolves.toEqual({
      OPENCODE_CONFIG_DIR: '/tmp/opencode-trabalho',
      XDG_DATA_HOME: '/tmp/share-trabalho',
    });
  });

  it('stores a token profile secret out of band and resolves it back as env', async () => {
    const svc = service();
    const created = await svc.create({ providerId: 'cline', name: 'Trabalho', token: 'secret-token' });
    expect(created.hasToken).toBe(true);
    await expect(svc.resolveEnv(created.id, 'cline')).resolves.toEqual({ CLINE_API_KEY: 'secret-token' });
  });

  it('rejects creating a profile for a provider without an official multi-account mechanism', async () => {
    const svc = service();
    await expect(svc.create({ providerId: 'antigravity', name: 'Trabalho' })).rejects.toThrow('multi-conta');
  });

  it('rejects a duplicate profile name for the same provider', async () => {
    const svc = service();
    await svc.create({ providerId: 'claude', name: 'Trabalho', configDir: '~/.claude-trabalho' });
    await expect(svc.create({ providerId: 'claude', name: 'Trabalho', configDir: '~/.claude-outro' }))
      .rejects.toThrow('Já existe um perfil');
  });

  it('resolves by stable id, so renaming a profile never breaks resolution', async () => {
    const svc = service();
    const created = await svc.create({ providerId: 'claude', name: 'Trabalho', configDir: '/tmp/claude-trabalho' });
    await svc.update(created.id, { providerId: 'claude', name: 'Conta B', configDir: '/tmp/claude-trabalho' });
    await expect(svc.resolveEnv(created.id, 'claude')).resolves.toEqual({ CLAUDE_CONFIG_DIR: '/tmp/claude-trabalho' });
  });

  it('rejects resolving a profile against the wrong provider', async () => {
    const svc = service();
    const created = await svc.create({ providerId: 'claude', name: 'Trabalho', configDir: '~/.claude-trabalho' });
    await expect(svc.resolveEnv(created.id, 'codex')).rejects.toThrow('não encontrado');
  });
});
