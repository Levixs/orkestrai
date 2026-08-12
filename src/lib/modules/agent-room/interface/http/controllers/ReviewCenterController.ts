import { Controller } from '@beeblock/svelar/routing';
import { reviewCenterService } from '$lib/modules/agent-room/application/services/ReviewCenterService.js';
import { CreateAgentReviewDto, CreateAgentReviewCommentDto, DecideAgentReviewDto } from '$lib/modules/agent-room/application/dto/AgentReviewDto.js';
import { CreateAgentReviewRequest } from '../requests/CreateAgentReviewRequest.js';
import { CreateAgentReviewCommentRequest } from '../requests/CreateAgentReviewCommentRequest.js';
import { DecideAgentReviewRequest } from '../requests/DecideAgentReviewRequest.js';
import { UpdateAgentReviewCommentRequest } from '../requests/UpdateAgentReviewCommentRequest.js';

export class ReviewCenterController extends Controller {
  async index(event: any) {
    try { return this.json({ data: await reviewCenterService.snapshot(event.params.id) }); }
    catch (error) { return this.failure(error, 'Falha ao carregar o Review Center.'); }
  }

  async store(event: any) {
    try {
      const input = await CreateAgentReviewRequest.validate(event);
      return this.json({ data: await reviewCenterService.create(event.params.id, CreateAgentReviewDto.from(input)) }, 201);
    } catch (error) { return this.failure(error, 'Falha ao criar review.'); }
  }

  async decide(event: any) {
    try {
      const input = await DecideAgentReviewRequest.validate(event);
      return this.json({ data: await reviewCenterService.decide(event.params.id, event.params.reviewId, DecideAgentReviewDto.from(input)) });
    } catch (error) { return this.failure(error, 'Falha ao registrar decisão.'); }
  }

  async comment(event: any) {
    try {
      const input = await CreateAgentReviewCommentRequest.validate(event);
      return this.json({ data: await reviewCenterService.addComment(event.params.id, event.params.reviewId, CreateAgentReviewCommentDto.from(input)) }, 201);
    } catch (error) { return this.failure(error, 'Falha ao criar comentário.'); }
  }

  async updateComment(event: any) {
    try {
      const input = await UpdateAgentReviewCommentRequest.validate(event);
      return this.json({ data: await reviewCenterService.resolveComment(event.params.id, event.params.reviewId, event.params.commentId, input.resolved) });
    } catch (error) { return this.failure(error, 'Falha ao atualizar comentário.'); }
  }

  private failure(error: unknown, fallback: string) {
    return this.json({ error: error instanceof Error ? error.message : fallback }, 400);
  }
}
