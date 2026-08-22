import { Model } from '@beeblock/svelar/orm';

export class AgentHuddle extends Model {
  static table = 'agent_huddles';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id',
    'workspace_id',
    'title',
    'agenda',
    'status',
    'facilitator_node_id',
    'linked_task_id',
    'created_by_kind',
    'created_by_id',
    'started_at',
    'ended_at',
    'created_at',
    'updated_at',
  ];
  static casts = {
    started_at: 'date' as const,
    ended_at: 'date' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };
  declare id: string;
  declare workspace_id: string;
  declare title: string;
  declare agenda: string | null;
  declare status: string;
  declare facilitator_node_id: string | null;
  declare linked_task_id: string | null;
  declare created_by_kind: string;
  declare created_by_id: string | null;
  declare started_at: Date;
  declare ended_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}
