import { Model } from '@beeblock/svelar/orm';

export class AgentWorkspaceGroup extends Model {
  static table = 'agent_workspace_groups';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = true;
  static fillable = ['id', 'name', 'parent_id', 'position'];

  static casts = {
    position: 'number' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare name: string;
  declare parent_id: string | null;
  declare position: number;
  declare created_at: Date;
  declare updated_at: Date;
}
