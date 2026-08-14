import { Model } from '@beeblock/svelar/orm';

export class CollaborationShare extends Model {
  static table = 'agent_collaboration_shares';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'workspace_id', 'status', 'default_role', 'relay_url', 'relay_region',
    'max_peers', 'revision', 'expires_at', 'started_at', 'stopped_at', 'created_at', 'updated_at',
  ];
  static casts = {
    expires_at: 'date' as const, started_at: 'date' as const, stopped_at: 'date' as const,
    created_at: 'date' as const, updated_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare status: string;
  declare default_role: string;
  declare relay_url: string;
  declare relay_region: string | null;
  declare max_peers: number;
  declare revision: number;
  declare expires_at: Date;
  declare started_at: Date;
  declare stopped_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}
