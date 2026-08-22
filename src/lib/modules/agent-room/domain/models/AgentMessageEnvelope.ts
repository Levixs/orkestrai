import { Model } from '@beeblock/svelar/orm';

export class AgentMessageEnvelope extends Model {
  static table = 'agent_message_envelopes';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'workspace_id', 'from_node_id', 'to_node_id', 'kind', 'state',
    'content', 'reply', 'error', 'content_hash', 'correlation_id', 'dedup_key',
    'attempts', 'metadata_json', 'delivered_at', 'acknowledged_at', 'replied_at',
    'failed_at', 'created_at', 'updated_at',
  ];

  static casts = {
    delivered_at: 'date' as const,
    acknowledged_at: 'date' as const,
    replied_at: 'date' as const,
    failed_at: 'date' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare from_node_id: string | null;
  declare to_node_id: string;
  declare kind: string;
  declare state: string;
  declare content: string;
  declare reply: string | null;
  declare error: string | null;
  declare content_hash: string;
  declare correlation_id: string | null;
  declare dedup_key: string | null;
  declare attempts: number;
  declare metadata_json: string | null;
  declare delivered_at: Date | null;
  declare acknowledged_at: Date | null;
  declare replied_at: Date | null;
  declare failed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}
