import { Model } from '@beeblock/svelar/orm';

export class AgentTaskEvent extends Model {
  static table = 'agent_task_events';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id',
    'conversation_id',
    'task_id',
    'type',
    'actor_member_id',
    'content',
    'metadata_json',
    'created_at',
  ];

  static casts = {
    created_at: 'date' as const,
  };

  declare id: string;
  declare conversation_id: string;
  declare task_id: string;
  declare type: string;
  declare actor_member_id: string | null;
  declare content: string;
  declare metadata_json: string | null;
  declare created_at: Date;
}
