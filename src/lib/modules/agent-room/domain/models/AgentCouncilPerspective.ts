import { Model } from '@beeblock/svelar/orm';

export class AgentCouncilPerspective extends Model {
  static table = 'agent_council_perspectives';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'council_id', 'workspace_id', 'agent_node_id', 'provider', 'model', 'approach',
    'status', 'floor_id', 'artifact_path', 'output_json', 'usage_snapshot_json', 'raw_output',
    'error', 'started_at', 'completed_at', 'created_at', 'updated_at',
  ];

  static casts = {
    started_at: 'date' as const,
    completed_at: 'date' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare council_id: string;
  declare workspace_id: string;
  declare agent_node_id: string;
  declare provider: string;
  declare model: string | null;
  declare approach: string;
  declare status: string;
  declare floor_id: string | null;
  declare artifact_path: string | null;
  declare output_json: string | null;
  declare usage_snapshot_json: string | null;
  declare raw_output: string | null;
  declare error: string | null;
  declare started_at: Date | null;
  declare completed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}
