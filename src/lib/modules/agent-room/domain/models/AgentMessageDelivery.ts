import { Model } from '@beeblock/svelar/orm';

export class AgentMessageDelivery extends Model {
  static table = 'agent_message_deliveries';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id',
    'message_id',
    'workspace_id',
    'from_node_id',
    'to_node_id',
    'state',
    'content',
    'reply',
    'error',
    'metadata_json',
    'created_at',
  ];

  static casts = {
    created_at: 'date' as const,
  };

  declare id: string;
  declare message_id: string;
  declare workspace_id: string;
  declare from_node_id: string | null;
  declare to_node_id: string;
  declare state: string;
  declare content: string;
  declare reply: string | null;
  declare error: string | null;
  declare metadata_json: string | null;
  declare created_at: Date;
}
