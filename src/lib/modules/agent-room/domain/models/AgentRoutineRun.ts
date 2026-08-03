import { Model } from '@beeblock/svelar/orm';

export class AgentRoutineRun extends Model {
  static table = 'agent_routine_runs';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = ['id', 'routine_id', 'ran_at', 'ok', 'detail'];

  static casts = {
    ok: 'boolean' as const,
    ran_at: 'date' as const,
  };

  declare id: string;
  declare routine_id: string;
  declare ran_at: Date;
  declare ok: boolean;
  declare detail: string | null;
}
