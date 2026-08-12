import { Model } from '@beeblock/svelar/orm';

export class AgentReview extends Model {
  static table = 'agent_reviews';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'workspace_id', 'task_id', 'assignee_node_id', 'title', 'summary',
    'status', 'revision', 'selected_paths_json', 'evidence_json', 'tests_json',
    'risks_json', 'decision_note', 'decided_at', 'created_at', 'updated_at',
  ];

  static casts = {
    decided_at: 'date' as const,
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare workspace_id: string;
  declare task_id: string | null;
  declare assignee_node_id: string | null;
  declare title: string;
  declare summary: string | null;
  declare status: string;
  declare revision: string;
  declare selected_paths_json: string | null;
  declare evidence_json: string | null;
  declare tests_json: string | null;
  declare risks_json: string | null;
  declare decision_note: string | null;
  declare decided_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}
