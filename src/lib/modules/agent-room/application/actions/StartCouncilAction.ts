import { Action } from '@beeblock/svelar/actions';
import type { CouncilData } from '../../contracts/schemas/council.schema.js';
import type { CreateCouncilDto } from '../dto/CouncilDto.js';
import { councilService } from '../services/CouncilService.js';

type StartCouncilActionInput = { workspaceId: string; council: CreateCouncilDto };

export class StartCouncilAction extends Action<StartCouncilActionInput, CouncilData> {
  async execute(input: StartCouncilActionInput): Promise<CouncilData> {
    return councilService.start(input.workspaceId, input.council);
  }
}
