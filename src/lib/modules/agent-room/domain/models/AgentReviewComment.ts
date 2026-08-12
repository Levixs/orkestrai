import { Model } from '@beeblock/svelar/orm';

export class AgentReviewComment extends Model {
  static table = 'agent_review_comments';
  static primaryKey = 'id';
  static incrementing = false;
  static timestamps = false;
  static fillable = [
    'id', 'review_id', 'workspace_id', 'author_node_id', 'file_path',
    'line_number', 'side', 'body', 'revision', 'status', 'created_at', 'updated_at',
  ];

  static casts = {
    created_at: 'date' as const,
    updated_at: 'date' as const,
  };

  declare id: string;
  declare review_id: string;
  declare workspace_id: string;
  declare author_node_id: string | null;
  declare file_path: string;
  declare line_number: number | null;
  declare side: string;
  declare body: string;
  declare revision: string;
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}
