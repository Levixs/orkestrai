import { Model } from '@beeblock/svelar/orm';

export class AgentRoutineRun extends Model {
  static table = 'agent_routine_runs';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'routine_id', 'ran_at', 'ok', 'detail', 'status', 'trigger_type',
    'trigger_key', 'idempotency_key', 'input_json', 'output_json', 'error',
    'agent_node_id', 'provider', 'usage_before_json', 'usage_after_json',
    'started_at', 'finished_at', 'duration_ms', 'attempt', 'retry_of_id',
  ];

  static casts = {
    ok: 'boolean' as const,
    ran_at: 'date' as const,
    started_at: 'date' as const,
    finished_at: 'date' as const,
    duration_ms: 'number' as const,
    attempt: 'number' as const,
  };

  declare id: string;
  declare routine_id: string;
  declare ran_at: Date;
  declare ok: boolean;
  declare detail: string | null;
  declare status: string | null;
  declare trigger_type: string | null;
  declare trigger_key: string | null;
  declare idempotency_key: string | null;
  declare input_json: string | null;
  declare output_json: string | null;
  declare error: string | null;
  declare agent_node_id: string | null;
  declare provider: string | null;
  declare usage_before_json: string | null;
  declare usage_after_json: string | null;
  declare started_at: Date | null;
  declare finished_at: Date | null;
  declare duration_ms: number | null;
  declare attempt: number | null;
  declare retry_of_id: string | null;
}
