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
    'created_at',
  ];

  static casts = {
    created_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare node_id: string;
  declare state: string;
  declare action: string | null;
  declare task_id: string | null;
  declare metadata_json: string | null;
  declare created_at: Date;
}
