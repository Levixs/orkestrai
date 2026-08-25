import { Model } from '@beeblock/svelar/orm';

export class AgentWorkspaceGroup extends Model {
  static table = 'agent_workspace_groups';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = true;
  static fillable = ['id', 'name', 'parent_id', 'position', 'collapsed'];

  static casts = {
    position: 'number' as const,
    collapsed: 'boolean' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare name: string;
  declare parent_id: string | null;
  declare position: number;
  declare collapsed: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}
