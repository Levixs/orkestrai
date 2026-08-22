import { Model } from '@beeblock/svelar/orm';

export class AgentAttentionItem extends Model {
  static table = 'agent_attention_items';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'workspace_id', 'activity_event_id', 'node_id', 'task_id', 'category',
    'severity', 'status', 'title', 'body', 'source_type', 'source_id',
    'correlation_id', 'action_json', 'read_at', 'snoozed_until', 'resolved_at',
    'created_at', 'updated_at',
  ];

  static casts = {
    read_at: 'date' as const,
    snoozed_until: 'date' as const,
    resolved_at: 'date' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare activity_event_id: string | null;
  declare node_id: string | null;
  declare task_id: string | null;
  declare category: string;
  declare severity: string;
  declare status: string;
  declare title: string;
  declare body: string | null;
  declare source_type: string | null;
  declare source_id: string | null;
  declare correlation_id: string | null;
  declare action_json: string | null;
  declare read_at: Date | null;
  declare snoozed_until: Date | null;
  declare resolved_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}
