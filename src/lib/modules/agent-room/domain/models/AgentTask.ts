import { Model } from '@beeblock/svelar/orm';

export class AgentTask extends Model {
  static table = 'agent_tasks';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = true;
  static fillable = [
    'id',
    'conversation_id',
    'title',
    'description',
    'status',
    'priority',
    'assignee_id',
    'created_by_member_id',
    'accepted_by_member_id',
    'blocked_reason',
    'result_summary',
  ];

  static casts = {
    priority: 'number' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare conversation_id: string;
  declare title: string;
  declare description: string;
  declare status: string;
  declare priority: number;
  declare assignee_id: string | null;
  declare created_by_member_id: string | null;
  declare accepted_by_member_id: string | null;
  declare blocked_reason: string | null;
  declare result_summary: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}
