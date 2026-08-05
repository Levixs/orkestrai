import { Model } from '@beeblock/svelar/orm';

export class AgentBoardTask extends Model {
  static table = 'agent_board_tasks';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id',
    'workspace_id',
    'title',
    'description',
    'status',
    'assignee_node_id',
    'image_path',
    'images_json',
    'created_by',
    'created_at',
    'updated_at',
  ];

  static casts = {
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare title: string;
  declare description: string | null;
  declare status: string;
  declare assignee_node_id: string | null;
  declare image_path: string | null;
  declare images_json: string | null;
  declare created_by: string;
  declare created_at: string;
  declare updated_at: string;
}
