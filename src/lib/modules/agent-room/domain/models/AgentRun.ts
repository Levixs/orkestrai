import { Model } from '@beeblock/svelar/orm';

export class AgentRun extends Model {
  static table = 'agent_runs';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id',
    'conversation_id',
    'agent',
    'member_id',
    'task_id',
    'provider',
    'model',
    'effort',
    'allow_writes',
    'mode',
    'prompt',
    'output',
    'raw_output',
    'exit_code',
    'error',
    'started_at',
    'finished_at',
  ];

  static casts = {
    allow_writes: 'boolean' as const,
    exit_code: 'number' as const,
    started_at: 'date' as const,
    finished_at: 'date' as const,
  };

  declare id: string;
  declare conversation_id: string;
  declare agent: string;
  declare member_id: string | null;
  declare task_id: string | null;
  declare provider: string | null;
  declare model: string | null;
  declare effort: string | null;
  declare allow_writes: boolean;
  declare mode: string;
  declare prompt: string;
  declare output: string | null;
  declare raw_output: string | null;
  declare exit_code: number | null;
  declare error: string | null;
  declare started_at: Date;
  declare finished_at: Date | null;
}
