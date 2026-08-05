import { Model } from '@beeblock/svelar/orm';

export class AgentPreset extends Model {
  static table = 'agent_presets';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = ['id', 'name', 'icon', 'description', 'data', 'created_at', 'updated_at'];

  static casts = {
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare name: string;
  declare icon: string | null;
  declare description: string | null;
  declare data: string;
  declare created_at: string;
  declare updated_at: string;
}
