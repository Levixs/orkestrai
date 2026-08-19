import { FormRequest } from '@beeblock/svelar/forms';
import {
  createDesignExplorationSchema,
  type CreateDesignExplorationInput,
} from '$lib/modules/agent-room/contracts/schemas/create-design-exploration.schema.js';

export class CreateDesignExplorationRequest extends FormRequest {
  rules() { return createDesignExplorationSchema; }

  authorize(): boolean { return true; }

  passedValidation(data: unknown): CreateDesignExplorationInput {
    return createDesignExplorationSchema.parse(data);
  }
}
