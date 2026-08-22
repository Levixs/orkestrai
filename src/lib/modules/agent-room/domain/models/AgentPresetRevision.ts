import { Model } from '@beeblock/svelar/orm';

export class AgentPresetRevision extends Model {
  static table = 'agent_preset_revisions';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = ['id', 'preset_id', 'version', 'revision_key', 'release_notes', 'data', 'checksum', 'created_at'];
  static casts = { created_at: 'date' as const };

  declare id: string;
  declare preset_id: string;
  declare version: string;
  declare revision_key: string;
  declare release_notes: string | null;
  declare data: string;
  declare checksum: string;
  declare created_at: string;
}
