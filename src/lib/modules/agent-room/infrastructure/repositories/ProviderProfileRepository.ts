import { uuidv7 } from '@beeblock/svelar/support';
import type { ProviderProfile } from '../../domain/types.js';
import { AgentProviderProfile } from '../../domain/models/AgentProviderProfile.js';

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function map(model: AgentProviderProfile): ProviderProfile {
  return {
    id: String(model.getAttribute('id')),
    providerId: String(model.getAttribute('provider_id')),
    name: String(model.getAttribute('name')),
    configDir: model.getAttribute('config_dir') as string | null,
    dataDir: model.getAttribute('data_dir') as string | null,
    hasToken: Boolean(model.getAttribute('has_token')),
    createdAt: iso(model.getAttribute('created_at')),
    updatedAt: iso(model.getAttribute('updated_at')),
  };
}

export type CreateProviderProfileInput = {
  providerId: string;
  name: string;
  normalizedName: string;
  configDir: string | null;
  dataDir: string | null;
  hasToken: boolean;
};

export class ProviderProfileRepository {
  async list(providerId?: string): Promise<ProviderProfile[]> {
    const query = AgentProviderProfile.query();
    if (providerId) query.where('provider_id', providerId);
    const rows = await query.orderBy('name', 'asc').get();
    return rows.map(map);
  }

  async find(id: string): Promise<ProviderProfile | null> {
    const model = await AgentProviderProfile.find(id);
    return model ? map(model) : null;
  }

  async findByNormalizedName(providerId: string, normalizedName: string): Promise<ProviderProfile | null> {
    const model = await AgentProviderProfile.query()
      .where('provider_id', providerId)
      .where('normalized_name', normalizedName)
      .first();
    return model ? map(model) : null;
  }

  async create(input: CreateProviderProfileInput): Promise<ProviderProfile> {
    const now = new Date().toISOString();
    const created = await AgentProviderProfile.create({
      id: uuidv7(),
      provider_id: input.providerId,
      name: input.name,
      normalized_name: input.normalizedName,
      config_dir: input.configDir,
      data_dir: input.dataDir,
      has_token: input.hasToken,
      created_at: now,
      updated_at: now,
    });
    return map(created);
  }

  async update(id: string, input: Partial<CreateProviderProfileInput>): Promise<ProviderProfile | null> {
    await AgentProviderProfile.query().where('id', id).update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.normalizedName !== undefined ? { normalized_name: input.normalizedName } : {}),
      ...(input.configDir !== undefined ? { config_dir: input.configDir } : {}),
      ...(input.dataDir !== undefined ? { data_dir: input.dataDir } : {}),
      ...(input.hasToken !== undefined ? { has_token: input.hasToken } : {}),
      updated_at: new Date().toISOString(),
    });
    return this.find(id);
  }

  async delete(id: string): Promise<boolean> {
    const model = await AgentProviderProfile.find(id);
    if (!model) return false;
    await AgentProviderProfile.query().where('id', id).delete();
    return true;
  }
}

export const providerProfileRepository = new ProviderProfileRepository();
