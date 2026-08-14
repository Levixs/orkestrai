import { Model } from '@beeblock/svelar/orm';

export class CollaborationDevice extends Model {
  static table = 'agent_collaboration_devices';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'share_id', 'workspace_id', 'device_id', 'display_name', 'platform',
    'public_key', 'fingerprint', 'role', 'scopes_json', 'requested_at',
    'approved_at', 'last_seen_at', 'revoked_at', 'created_at', 'updated_at',
  ];
  static casts = {
    requested_at: 'date' as const, approved_at: 'date' as const, last_seen_at: 'date' as const,
    revoked_at: 'date' as const, created_at: 'date' as const, updated_at: 'date' as const,
  };

  declare id: string;
  declare share_id: string;
  declare workspace_id: string;
  declare device_id: string;
  declare display_name: string;
  declare platform: string;
  declare public_key: string | null;
  declare fingerprint: string;
  declare role: string;
  declare scopes_json: string;
  declare requested_at: Date;
  declare approved_at: Date | null;
  declare last_seen_at: Date | null;
  declare revoked_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}
