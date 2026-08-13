import { Model } from '@beeblock/svelar/orm';

export class AgentAutomationIntegration extends Model {
  static table = 'agent_automation_integrations';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'workspace_id', 'type', 'name', 'config_json', 'secret_key', 'status',
    'last_checked_at', 'error', 'created_at', 'updated_at',
  ];

  static casts = {
    last_checked_at: 'date' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };
}
