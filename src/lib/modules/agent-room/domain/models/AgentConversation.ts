import { Model } from '@beeblock/svelar/orm';

export class AgentConversation extends Model {
  static table = 'agent_conversations';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = true;
  static fillable = ['id', 'title', 'mode', 'project_path'];

  static casts = {
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare title: string;
  declare mode: string;
  declare project_path: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}
