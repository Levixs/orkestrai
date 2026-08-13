import { Action } from '@beeblock/svelar/actions';
import type { CouncilData } from '../../contracts/schemas/council.schema.js';
import type { DecideCouncilDto } from '../dto/CouncilDto.js';
import { councilService } from '../services/CouncilService.js';

type DecideCouncilActionInput = { workspaceId: string; councilId: string; decision: DecideCouncilDto };

export class DecideCouncilAction extends Action<DecideCouncilActionInput, CouncilData> {
  async execute(input: DecideCouncilActionInput): Promise<CouncilData> {
    return councilService.decide(input.workspaceId, input.councilId, input.decision);
  }
}
