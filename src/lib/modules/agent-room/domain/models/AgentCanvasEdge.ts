import { Model } from '@beeblock/svelar/orm';

export class AgentCanvasEdge extends Model {
  static table = 'agent_canvas_edges';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = ['id', 'workspace_id', 'source_node_id', 'target_node_id', 'style', 'created_at'];

  static casts = {
    created_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare source_node_id: string;
  declare target_node_id: string;
  declare style: string;
  declare created_at: Date;
}
