import { Action } from '@beeblock/svelar/actions';
import type { CreateDesignExplorationDto } from '../dto/CreateDesignExplorationDto.js';
import {
  designExplorationService,
  type DesignExplorationResult,
} from '../services/DesignExplorationService.js';

type CreateDesignExplorationActionInput = { workspaceId: string; exploration: CreateDesignExplorationDto };

export class CreateDesignExplorationAction extends Action<CreateDesignExplorationActionInput, DesignExplorationResult> {
  async execute(input: CreateDesignExplorationActionInput): Promise<DesignExplorationResult> {
    return designExplorationService.create(input.workspaceId, input.exploration);
  }
}
