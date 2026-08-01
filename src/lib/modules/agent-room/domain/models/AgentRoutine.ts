import { Model } from '@beeblock/svelar/orm';

export class AgentRoutine extends Model {
  static table = 'agent_routines';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id',
    'workspace_id',
    'target_node_id',
    'prompt',
    'interval_minutes',
    'enabled',
    'last_run_at',
    'run_count',
    'created_at',
  ];

  static casts = {
    interval_minutes: 'number' as const,
    enabled: 'boolean' as const,
    run_count: 'number' as const,
    last_run_at: 'date' as const,
    created_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare target_node_id: string;
  declare prompt: string;
  declare interval_minutes: number | null;
  declare enabled: boolean;
  declare last_run_at: Date | null;
  declare run_count: number;
  declare created_at: Date;
}
