import { Model } from '@beeblock/svelar/orm';

export class CollaborationAuditEvent extends Model {
  static table = 'agent_collaboration_audit_events';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = ['id', 'workspace_id', 'share_id', 'actor_device_id', 'event_type', 'metadata_json', 'created_at'];
  static casts = { created_at: 'date' as const };

  declare id: string;
  declare workspace_id: string;
  declare share_id: string | null;
  declare actor_device_id: string | null;
  declare event_type: string;
  declare metadata_json: string | null;
  declare created_at: Date;
}
