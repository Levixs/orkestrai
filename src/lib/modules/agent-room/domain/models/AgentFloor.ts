import { Model } from '@beeblock/svelar/orm';

export class AgentFloor extends Model {
  static table = 'agent_floors';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = true;
  static fillable = ['id', 'workspace_id', 'name', 'branch', 'path', 'status'];

  static casts = {
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare name: string;
  declare branch: string;
  declare path: string;
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}
