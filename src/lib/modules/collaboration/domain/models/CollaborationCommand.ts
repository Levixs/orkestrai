import { Model } from '@beeblock/svelar/orm';

export class CollaborationCommand extends Model {
  static table = 'agent_collaboration_commands';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'share_id', 'workspace_id', 'device_record_id', 'requested_revision',
    'result_revision', 'command_type', 'status', 'result_json', 'error_code',
    'created_at', 'completed_at',
  ];
  static casts = { created_at: 'date' as const, completed_at: 'date' as const };

  declare id: string;
  declare share_id: string;
  declare workspace_id: string;
  declare device_record_id: string;
  declare requested_revision: number;
  declare result_revision: number;
  declare command_type: string;
  declare status: string;
  declare result_json: string | null;
  declare error_code: string | null;
  declare created_at: Date;
  declare completed_at: Date | null;
}
