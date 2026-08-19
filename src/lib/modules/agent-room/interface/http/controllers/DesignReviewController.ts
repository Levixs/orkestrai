import { Controller } from '@beeblock/svelar/routing';
import { ReviewDesignDto } from '$lib/modules/agent-room/application/dto/DesignDtos.js';
import { designReviewService } from '$lib/modules/agent-room/application/services/DesignReviewService.js';
import { DesignReviewRequest } from '../requests/DesignReviewRequest.js';

export class DesignReviewController extends Controller {
  async store(event: any) {
    try {
      const input = await DesignReviewRequest.validate(event);
      const data = await designReviewService.review(ReviewDesignDto.from(event.params.id, event.params.nodeId, input));
      return this.json({ data });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'design_review_failed';
      const status = code === 'design_review_revision_changed' ? 409 : 422;
      return this.json({ error: code }, status);
    }
  }
}
