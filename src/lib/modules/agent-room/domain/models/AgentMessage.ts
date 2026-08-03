import { Model } from '@beeblock/svelar/orm';

export class AgentMessage extends Model {
  static table = 'agent_messages';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = ['id', 'conversation_id', 'participant', 'content', 'metadata_json', 'created_at'];

  static casts = {
    created_at: 'date' as const,
  };

  declare id: string;
  declare conversation_id: string;
  declare participant: string;
  declare content: string;
  declare metadata_json: string | null;
  declare created_at: Date;
}
