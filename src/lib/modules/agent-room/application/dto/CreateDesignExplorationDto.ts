import type { CreateDesignExplorationInput } from '../../contracts/schemas/create-design-exploration.schema.js';

export class CreateDesignExplorationDto {
  private constructor(
    readonly title: string,
    readonly objective: string,
    readonly audience: string,
    readonly platform: CreateDesignExplorationInput['platform'],
    readonly codeTarget: CreateDesignExplorationInput['codeTarget'],
    readonly constraints: string,
    readonly references: string,
    readonly includeDarkMode: boolean,
    readonly executionMode: CreateDesignExplorationInput['executionMode'],
    readonly leaderNodeId: string | null,
    readonly locale: CreateDesignExplorationInput['locale'],
  ) {}

  static from(input: CreateDesignExplorationInput): CreateDesignExplorationDto {
    return new CreateDesignExplorationDto(
      input.title,
      input.objective,
      input.audience,
      input.platform,
      input.codeTarget,
      input.constraints,
      input.references,
      input.includeDarkMode,
      input.executionMode,
      input.leaderNodeId ?? null,
      input.locale,
    );
  }
}
