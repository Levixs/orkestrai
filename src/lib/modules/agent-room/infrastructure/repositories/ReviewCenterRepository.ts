import { uuidv7 } from '@beeblock/svelar/support';
import type { CreateAgentReviewCommentDto, CreateAgentReviewDto, DecideAgentReviewDto } from '../../application/dto/AgentReviewDto.js';
import { AgentReview } from '../../domain/models/AgentReview.js';
import { AgentReviewComment } from '../../domain/models/AgentReviewComment.js';

export class ReviewCenterRepository {
  async createReview(workspaceId: string, revision: string, input: CreateAgentReviewDto): Promise<AgentReview> {
    const now = new Date().toISOString();
    return AgentReview.create({
      id: uuidv7(),
      workspace_id: workspaceId,
      task_id: input.taskId,
      assignee_node_id: input.assigneeNodeId,
      title: input.title,
      summary: input.summary,
      status: 'pending',
      revision,
      selected_paths_json: JSON.stringify(input.selectedPaths),
      evidence_json: JSON.stringify(input.evidence),
      tests_json: JSON.stringify(input.tests),
      risks_json: JSON.stringify(input.risks),
      decision_note: null,
      decided_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  async listReviews(workspaceId: string): Promise<AgentReview[]> {
    return AgentReview.query().where('workspace_id', workspaceId).orderBy('updated_at', 'desc').get();
  }

  async findReview(id: string): Promise<AgentReview | null> {
    return AgentReview.find(id);
  }

  async decideReview(id: string, input: DecideAgentReviewDto): Promise<AgentReview | null> {
    const model = await AgentReview.find(id);
    if (!model) return null;
    const now = new Date().toISOString();
    await model.update({ status: input.status, decision_note: input.note, decided_at: now, updated_at: now });
    return AgentReview.find(id);
  }

  async createComment(
    review: AgentReview,
    revision: string,
    input: CreateAgentReviewCommentDto,
  ): Promise<AgentReviewComment> {
    const now = new Date().toISOString();
    const comment = await AgentReviewComment.create({
      id: uuidv7(),
      review_id: review.getAttribute('id'),
      workspace_id: review.getAttribute('workspace_id'),
      author_node_id: input.authorNodeId,
      file_path: input.filePath,
      line_number: input.lineNumber,
      side: input.side,
      body: input.body,
      revision,
      status: 'open',
      created_at: now,
      updated_at: now,
    });
    await review.update({ updated_at: now });
    return comment;
  }

  async listComments(reviewId: string): Promise<AgentReviewComment[]> {
    return AgentReviewComment.query().where('review_id', reviewId).orderBy('created_at', 'asc').get();
  }

  async resolveComment(reviewId: string, commentId: string, resolved: boolean): Promise<AgentReviewComment | null> {
    const model = await AgentReviewComment.query().where('id', commentId).where('review_id', reviewId).first();
    if (!model) return null;
    await model.update({ status: resolved ? 'resolved' : 'open', updated_at: new Date().toISOString() });
    return AgentReviewComment.find(commentId);
  }

  async deleteWorkspaceHistory(workspaceId: string): Promise<void> {
    await AgentReviewComment.query().where('workspace_id', workspaceId).delete();
    await AgentReview.query().where('workspace_id', workspaceId).delete();
  }
}

export const reviewCenterRepository = new ReviewCenterRepository();
