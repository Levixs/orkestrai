import { Controller } from '@beeblock/svelar/routing';
import { CreateDesignExplorationAction } from '../../../application/actions/CreateDesignExplorationAction.js';
import { CreateDesignExplorationDto } from '../../../application/dto/CreateDesignExplorationDto.js';
import { CreateDesignExplorationRequest } from '../requests/CreateDesignExplorationRequest.js';
import { DesignExplorationResource } from '../resources/DesignExplorationResource.js';

export class DesignExplorationController extends Controller {
  async store(event: any) {
    try {
      const input = await CreateDesignExplorationRequest.validate(event);
      const created = await new CreateDesignExplorationAction().execute({
        workspaceId: event.params.id,
        exploration: CreateDesignExplorationDto.from(input),
      });
      return this.json({ data: new DesignExplorationResource(created).toJSON() }, 201);
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Could not create the UI exploration.' }, 400);
    }
  }
}
