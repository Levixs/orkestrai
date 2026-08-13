import { Controller } from '@beeblock/svelar/routing';
import { StartCouncilAction } from '../../../application/actions/StartCouncilAction.js';
import { DecideCouncilAction } from '../../../application/actions/DecideCouncilAction.js';
import { CreateCouncilDto, DecideCouncilDto } from '../../../application/dto/CouncilDto.js';
import { councilService } from '../../../application/services/CouncilService.js';
import { CreateCouncilRequest } from '../requests/CreateCouncilRequest.js';
import { DecideCouncilRequest } from '../requests/DecideCouncilRequest.js';
import { LandCouncilPerspectiveRequest } from '../requests/LandCouncilPerspectiveRequest.js';

export class CouncilController extends Controller {
  async index(event: any) {
    try { return this.json({ data: await councilService.snapshot(event.params.id) }); }
    catch (error) { return this.failure(error, 'Could not load councils.'); }
  }

  async show(event: any) {
    try { return this.json({ data: await councilService.get(event.params.id, event.params.councilId) }); }
    catch (error) { return this.failure(error, 'Council not found.', 404); }
  }

  async store(event: any) {
    try {
      const input = await CreateCouncilRequest.validate(event);
      const data = await new StartCouncilAction().execute({
        workspaceId: event.params.id,
        council: CreateCouncilDto.from(input),
      });
      return this.json({ data }, 202);
    } catch (error) { return this.failure(error, 'Could not start the council.'); }
  }

  async decide(event: any) {
    try {
      const input = await DecideCouncilRequest.validate(event);
      const data = await new DecideCouncilAction().execute({
        workspaceId: event.params.id,
        councilId: event.params.councilId,
        decision: DecideCouncilDto.from(input),
      });
      return this.json({ data });
    } catch (error) { return this.failure(error, 'Could not record the council decision.'); }
  }

  async preview(event: any) {
    try {
      const targetBranch = event.url.searchParams.get('targetBranch') || undefined;
      return this.json({ data: await councilService.landingPreview(
        event.params.id, event.params.councilId, event.params.perspectiveId, targetBranch,
      ) });
    } catch (error) { return this.failure(error, 'Could not preview the landing.'); }
  }

  async land(event: any) {
    try {
      const input = await LandCouncilPerspectiveRequest.validate(event);
      return this.json({ data: await councilService.land(
        event.params.id, event.params.councilId, event.params.perspectiveId, input,
      ) });
    } catch (error) { return this.failure(error, 'Could not land the selected perspective.'); }
  }

  private failure(error: unknown, fallback: string, status = 400) {
    return this.json({ error: error instanceof Error ? error.message : fallback }, status);
  }
}
