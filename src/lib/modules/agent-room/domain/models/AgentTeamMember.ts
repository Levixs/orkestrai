import { Model } from '@beeblock/svelar/orm';

export class AgentTeamMember extends Model {
  static table = 'agent_team_members';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = true;
  static fillable = [
    'id',
    'conversation_id',
    'title',
    'provider',
    'role',
    'model',
    'effort',
    'can_write',
    'participates_in_loop',
    'capabilities_json',
    'system_prompt',
  ];

  static casts = {
    can_write: 'boolean' as const,
    participates_in_loop: 'boolean' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare conversation_id: string;
  declare title: string;
  declare provider: string;
  declare role: string;
  declare model: string | null;
  declare effort: string;
  declare can_write: boolean;
  declare participates_in_loop: boolean;
  declare capabilities_json: string;
  declare system_prompt: string;
  declare created_at: Date;
  declare updated_at: Date;
}
