import { Model } from '@beeblock/svelar/orm';

export class AgentHuddleParticipant extends Model {
  static table = 'agent_huddle_participants';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id',
    'huddle_id',
    'workspace_id',
    'kind',
    'participant_id',
    'participant_key',
    'display_name',
    'role',
    'voice_enabled',
    'joined_at',
    'left_at',
    'created_at',
    'updated_at',
  ];
  static casts = {
    voice_enabled: 'boolean' as const,
    joined_at: 'date' as const,
    left_at: 'date' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };
  declare id: string;
  declare huddle_id: string;
  declare workspace_id: string;
  declare kind: string;
  declare participant_id: string;
  declare participant_key: string;
  declare display_name: string;
  declare role: string;
  declare voice_enabled: boolean;
  declare joined_at: Date;
  declare left_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}
