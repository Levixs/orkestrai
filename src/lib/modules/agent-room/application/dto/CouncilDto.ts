import type { CreateCouncilInput, DecideCouncilInput } from '../../contracts/schemas/council.schema.js';

export class CreateCouncilDto {
  private constructor(
    readonly title: string,
    readonly objective: string,
    readonly taskId: string | null,
    readonly leaderNodeId: string | null,
    readonly mode: CreateCouncilInput['mode'],
    readonly criterion: CreateCouncilInput['criterion'],
    readonly customCriterion: string | null,
    readonly requestLeaderRecommendation: boolean,
    readonly maxExecutions: number,
    readonly perspectives: CreateCouncilInput['perspectives'],
  ) {}

  static from(input: CreateCouncilInput): CreateCouncilDto {
    return new CreateCouncilDto(
      input.title,
      input.objective,
      input.taskId ?? null,
      input.leaderNodeId ?? null,
      input.mode,
      input.criterion,
      input.customCriterion ?? null,
      input.requestLeaderRecommendation,
      input.maxExecutions,
      input.perspectives,
    );
  }
}

export class DecideCouncilDto {
  private constructor(
    readonly status: DecideCouncilInput['status'],
    readonly selectedPerspectiveId: string | null,
    readonly note: string | null,
  ) {}

  static from(input: DecideCouncilInput): DecideCouncilDto {
    return new DecideCouncilDto(input.status, input.selectedPerspectiveId ?? null, input.note ?? null);
  }
}
