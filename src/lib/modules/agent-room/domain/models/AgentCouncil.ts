import { Model } from '@beeblock/svelar/orm';

export class AgentCouncil extends Model {
  static table = 'agent_councils';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'workspace_id', 'task_id', 'leader_node_id', 'title', 'objective', 'mode',
    'criterion', 'custom_criterion', 'request_leader_recommendation', 'max_executions',
    'execution_count', 'status', 'recommendation_json', 'recommendation_error', 'selected_perspective_id',
    'decision_note', 'started_at', 'completed_at', 'decided_at', 'created_at', 'updated_at',
  ];

  static casts = {
    request_leader_recommendation: 'boolean' as const,
    started_at: 'date' as const,
    completed_at: 'date' as const,
    decided_at: 'date' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare task_id: string | null;
  declare leader_node_id: string | null;
  declare title: string;
  declare objective: string;
  declare mode: string;
  declare criterion: string;
  declare custom_criterion: string | null;
  declare request_leader_recommendation: boolean;
  declare max_executions: number;
  declare execution_count: number;
  declare status: string;
  declare recommendation_json: string | null;
  declare recommendation_error: string | null;
  declare selected_perspective_id: string | null;
  declare decision_note: string | null;
  declare started_at: Date;
  declare completed_at: Date | null;
  declare decided_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}
