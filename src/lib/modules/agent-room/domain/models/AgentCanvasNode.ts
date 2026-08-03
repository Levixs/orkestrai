import { Model } from '@beeblock/svelar/orm';

export class AgentCanvasNode extends Model {
  static table = 'agent_canvas_nodes';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = true;
  static fillable = [
    'id',
    'workspace_id',
    'type',
    'title',
    'x',
    'y',
    'width',
    'height',
    'z_index',
    'payload_json',
    'floor_id',
  ];

  static casts = {
    x: 'number' as const,
    y: 'number' as const,
    width: 'number' as const,
    height: 'number' as const,
    z_index: 'number' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare type: string;
  declare title: string | null;
  declare x: number;
  declare y: number;
  declare width: number;
  declare height: number;
  declare z_index: number;
  declare payload_json: string | null;
  declare floor_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}
