import { Model } from '@beeblock/svelar/orm';

export class AgentActivityEvent extends Model {
  static table = 'agent_activity_events';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id',
    'workspace_id',
    'node_id',
    'state',
    'action',
    'task_id',
    'metadata_json',
    'category',
    'verb',
    'object_type',
    'object_id',
    'object_title',
    'outcome',
    'severity',
    'correlation_id',
    'source_type',
    'source_id',
    'attention_required',
    'resolved_at',
    'created_at',
  ];

  static casts = {
    attention_required: 'boolean' as const,
    resolved_at: 'date' as const,
    created_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare node_id: string;
  declare state: string;
  declare action: string | null;
  declare task_id: string | null;
  declare metadata_json: string | null;
  declare category: string | null;
  declare verb: string | null;
  declare object_type: string | null;
  declare object_id: string | null;
  declare object_title: string | null;
  declare outcome: string | null;
  declare severity: string | null;
  declare correlation_id: string | null;
  declare source_type: string | null;
  declare source_id: string | null;
  declare attention_required: boolean;
  declare resolved_at: Date | null;
  declare created_at: Date;
}
