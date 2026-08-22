import { Model } from '@beeblock/svelar/orm';

export class AgentHuddleTurn extends Model {
  static table = 'agent_huddle_turns';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id',
    'huddle_id',
    'workspace_id',
    'sequence',
    'turn_key',
    'speaker_kind',
    'speaker_id',
    'speaker_name',
    'addressed_node_id',
    'text',
    'state',
    'message_id',
    'error_code',
    'completed_at',
    'created_at',
    'updated_at',
  ];
  static casts = {
    sequence: 'number' as const,
    completed_at: 'date' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };
  declare id: string;
  declare huddle_id: string;
  declare workspace_id: string;
  declare sequence: number;
  declare turn_key: string;
  declare speaker_kind: string;
  declare speaker_id: string | null;
  declare speaker_name: string;
  declare addressed_node_id: string | null;
  declare text: string;
  declare state: string;
  declare message_id: string | null;
  declare error_code: string | null;
  declare completed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}
