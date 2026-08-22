import type {
  ContributeHuddleTurnInput,
  CreateHuddleInput,
  CreateHuddleTaskInput,
  SubmitHuddleTurnInput,
  UpdateHuddleInput,
} from '../../contracts/schemas/huddle.schema.js';

export class CreateHuddleDto {
  private constructor(
    readonly title: string,
    readonly agenda: string | null,
    readonly agentNodeIds: string[],
    readonly facilitatorNodeId: string | null,
  ) {}

  static from(input: CreateHuddleInput): CreateHuddleDto {
    return new CreateHuddleDto(input.title, input.agenda ?? null, input.agentNodeIds, input.facilitatorNodeId ?? null);
  }
}

export class UpdateHuddleDto {
  private constructor(
    readonly operation: UpdateHuddleInput['operation'],
    readonly agentNodeIds: string[],
  ) {}

  static from(input: UpdateHuddleInput): UpdateHuddleDto {
    return new UpdateHuddleDto(input.operation, input.operation === 'add_agents' ? input.agentNodeIds : []);
  }
}

export class SubmitHuddleTurnDto {
  private constructor(
    readonly text: string,
    readonly targetNodeIds: string[],
  ) {}

  static from(input: SubmitHuddleTurnInput): SubmitHuddleTurnDto {
    return new SubmitHuddleTurnDto(input.text, input.targetNodeIds);
  }
}

export class ContributeHuddleTurnDto {
  private constructor(readonly text: string) {}

  static from(input: ContributeHuddleTurnInput): ContributeHuddleTurnDto {
    return new ContributeHuddleTurnDto(input.text);
  }
}

export class CreateHuddleTaskDto {
  private constructor(
    readonly title: string,
    readonly status: string | undefined,
  ) {}

  static from(input: CreateHuddleTaskInput): CreateHuddleTaskDto {
    return new CreateHuddleTaskDto(input.title, input.status);
  }
}
