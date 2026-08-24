import { Model } from '@beeblock/svelar/orm';

export class AgentProviderProfile extends Model {
  static table = 'agent_provider_profiles';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = true;
  static fillable = ['id', 'provider_id', 'name', 'config_dir', 'data_dir', 'has_token'];

  static casts = {
    has_token: 'boolean' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare provider_id: string;
  declare name: string;
  declare config_dir: string | null;
  declare data_dir: string | null;
  declare has_token: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}
