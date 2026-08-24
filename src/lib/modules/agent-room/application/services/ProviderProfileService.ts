import { homedir } from 'node:os';
import { getAgentAdapter, hasAgentAdapter } from '../adapters/registry.js';
import type { AgentProfileStrategy } from '../adapters/types.js';
import type { ProviderProfile } from '../../domain/types.js';
import {
  providerProfileRepository,
  type ProviderProfileRepository,
} from '../../infrastructure/repositories/ProviderProfileRepository.js';
import { desktopSecretService } from '../../infrastructure/secrets/DesktopSecretService.js';

function secretKey(profileId: string): string {
  return `automation:provider-profile:${profileId}`;
}

/** `~` nao expande sozinho fora de um shell — spawn direto (execFile/PTY)
    receberia o caractere literal. Normaliza uma vez, no save, para todo
    consumidor (spawn de agente, leitura de uso) ler o mesmo path absoluto. */
function expandHome(dir: string): string {
  return dir === '~' || dir.startsWith('~/') ? dir.replace(/^~/, homedir()) : dir;
}

export type SaveProviderProfileInput = {
  providerId: string;
  name: string;
  configDir?: string | null;
  dataDir?: string | null;
  token?: string | null;
};

type SecretStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type ProviderProfileServiceOptions = {
  repository?: ProviderProfileRepository;
  secrets?: SecretStore;
  adapterProfileStrategy?: (providerId: string) => AgentProfileStrategy;
};

export class ProviderProfileService {
  private readonly repository: ProviderProfileRepository;
  private readonly secrets: SecretStore;
  private readonly adapterProfileStrategy: (providerId: string) => AgentProfileStrategy;

  constructor(options: ProviderProfileServiceOptions = {}) {
    this.repository = options.repository ?? providerProfileRepository;
    this.secrets = options.secrets ?? desktopSecretService;
    this.adapterProfileStrategy = options.adapterProfileStrategy ?? ((providerId) => {
      if (!hasAgentAdapter(providerId)) throw new Error(`Provider desconhecido: "${providerId}".`);
      return getAgentAdapter(providerId).profileStrategy;
    });
  }

  async list(providerId?: string): Promise<ProviderProfile[]> {
    return this.repository.list(providerId);
  }

  /** Resolve por id OU nome (case-insensitive) — a bridge/CLI/MCP recebem um
      nome digitado pelo agente, nao o uuid interno. */
  async resolveByIdOrName(providerId: string, idOrName: string): Promise<ProviderProfile | null> {
    const byId = await this.repository.find(idOrName);
    if (byId && byId.providerId === providerId) return byId;
    const profiles = await this.repository.list(providerId);
    const needle = idOrName.trim().toLowerCase();
    return profiles.find((profile) => profile.name.toLowerCase() === needle) ?? null;
  }

  strategyFor(providerId: string): AgentProfileStrategy {
    return this.adapterProfileStrategy(providerId);
  }

  async create(input: SaveProviderProfileInput): Promise<ProviderProfile> {
    const { name, configDir, dataDir, hasToken } = await this.validate(input, null);
    const created = await this.repository.create({
      providerId: input.providerId,
      name,
      configDir,
      dataDir,
      hasToken,
    });
    if (hasToken && input.token) await this.secrets.set(secretKey(created.id), input.token.trim());
    return created;
  }

  async update(id: string, input: SaveProviderProfileInput): Promise<ProviderProfile> {
    const existing = await this.repository.find(id);
    if (!existing || existing.providerId !== input.providerId) throw new Error('Perfil não encontrado para esse provider.');
    const { name, configDir, dataDir, hasToken } = await this.validate(input, id);
    const updated = await this.repository.update(id, { name, configDir, dataDir, hasToken });
    if (!updated) throw new Error('Perfil não encontrado.');
    if (hasToken && input.token) await this.secrets.set(secretKey(id), input.token.trim());
    return updated;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (deleted) await this.secrets.delete(secretKey(id)).catch(() => undefined);
  }

  /** Env a aplicar ao spawnar o processo com esse perfil ativo — determinado
      pela estrategia do provider, nunca por "todas as chaves ja vistas" (o
      jeito fragil que perfis genericos de env costumam usar). */
  async resolveEnv(profileId: string, expectedProviderId: string): Promise<Record<string, string>> {
    const profile = await this.repository.find(profileId);
    if (!profile || profile.providerId !== expectedProviderId) throw new Error('Perfil não encontrado para esse provider.');
    const strategy = this.strategyFor(profile.providerId);
    if (strategy.kind === 'configDir') {
      if (!profile.configDir) throw new Error('Perfil sem diretório de config configurado.');
      return { [strategy.envVar]: profile.configDir };
    }
    if (strategy.kind === 'configDirPair') {
      if (!profile.configDir || !profile.dataDir) throw new Error('Perfil sem os dois diretórios configurados.');
      return { [strategy.configEnvVar]: profile.configDir, [strategy.dataEnvVar]: profile.dataDir };
    }
    if (strategy.kind === 'token') {
      const token = await this.secrets.get(secretKey(profileId));
      if (!token) throw new Error('Perfil sem token salvo.');
      return { [strategy.envVar]: token };
    }
    throw new Error(`Provider "${profile.providerId}" não suporta perfis.`);
  }

  private async validate(
    input: SaveProviderProfileInput,
    excludeId: string | null,
  ): Promise<{ name: string; configDir: string | null; dataDir: string | null; hasToken: boolean }> {
    const strategy = this.strategyFor(input.providerId);
    if (strategy.kind === 'unsupported') {
      throw new Error(`${input.providerId} não tem um mecanismo oficial de multi-conta — não é possível criar um perfil.`);
    }
    const name = input.name.trim().slice(0, 48);
    if (!name) throw new Error('Informe o nome do perfil.');
    const duplicate = await this.repository.findByName(input.providerId, name);
    if (duplicate && duplicate.id !== excludeId) throw new Error(`Já existe um perfil "${name}" para esse provider.`);

    if (strategy.kind === 'configDir') {
      const configDir = input.configDir?.trim();
      if (!configDir) throw new Error('Informe o diretório de config do perfil.');
      return { name, configDir: expandHome(configDir), dataDir: null, hasToken: false };
    }
    if (strategy.kind === 'configDirPair') {
      const configDir = input.configDir?.trim();
      const dataDir = input.dataDir?.trim();
      if (!configDir || !dataDir) throw new Error('Informe os dois diretórios do perfil (config e dados).');
      return { name, configDir: expandHome(configDir), dataDir: expandHome(dataDir), hasToken: false };
    }
    // strategy.kind === 'token'
    const isUpdate = excludeId !== null;
    const token = input.token?.trim();
    if (!token && !isUpdate) throw new Error('Informe o token do perfil.');
    return { name, configDir: null, dataDir: null, hasToken: token ? true : isUpdate };
  }
}

export const providerProfileService = new ProviderProfileService();
