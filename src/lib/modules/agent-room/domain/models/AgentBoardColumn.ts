import { Model } from '@beeblock/svelar/orm';

export class AgentBoardColumn extends Model {
  static table = 'agent_board_columns';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = true;
  static fillable = ['id', 'workspace_id', 'key', 'name', 'color', 'position', 'builtin', 'created_at', 'updated_at'];

  static casts = {
    position: 'number' as const,
    builtin: 'boolean' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare key: string;
  declare name: string | null;
  declare color: string;
  declare position: number;
  declare builtin: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}
