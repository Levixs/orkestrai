import { Model } from '@beeblock/svelar/orm';

export class AgentMemorySource extends Model {
  static table = 'agent_memory_sources';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'memory_entry_id', 'workspace_id', 'type', 'source_id', 'label',
    'uri', 'excerpt', 'content_hash', 'metadata_json', 'created_at', 'updated_at',
  ];

  static casts = { created_at: 'date' as const, updated_at: 'date' as const };

  declare id: string;
  declare memory_entry_id: string;
  declare workspace_id: string;
  declare type: string;
  declare source_id: string | null;
  declare label: string;
  declare uri: string | null;
  declare excerpt: string | null;
  declare content_hash: string;
  declare metadata_json: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}
