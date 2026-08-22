import { Model } from '@beeblock/svelar/orm';

export class AgentMemoryEntry extends Model {
  static table = 'agent_memory_entries';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'workspace_id', 'kind', 'status', 'title', 'content', 'confidence',
    'pinned', 'tags_json', 'created_by_node_id', 'supersedes_id', 'revision',
    'verified_at', 'created_at', 'updated_at',
  ];

  static casts = {
    confidence: 'number' as const,
    pinned: 'boolean' as const,
    revision: 'number' as const,
    verified_at: 'date' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare kind: string;
  declare status: string;
  declare title: string;
  declare content: string;
  declare confidence: number;
  declare pinned: boolean;
  declare tags_json: string | null;
  declare created_by_node_id: string | null;
  declare supersedes_id: string | null;
  declare revision: number;
  declare verified_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}
