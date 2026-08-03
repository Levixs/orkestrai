import type { AgentLoopPayload, TeamMember } from '$lib/modules/agent-room/domain/types.js';
import type { AgentLoopInput } from '$lib/modules/agent-room/contracts/schemas/schemas.js';

export class AgentLoopDto {
  constructor(
    public readonly message: string,
    public readonly mode: AgentLoopPayload['mode'],
    public readonly allowWrites: boolean,
    public readonly projectPath: string | null,
    public readonly maxRounds: number | undefined,
    public readonly executionMode: AgentLoopPayload['executionMode']
  ) {}

  static from(input: AgentLoopInput): AgentLoopDto {
    return new AgentLoopDto(
      input.message,
      input.mode,
      input.allowWrites,
      input.projectPath ?? null,
      input.maxRounds,
      input.executionMode
    );
  }

  toPayload(): AgentLoopPayload {
    return {
      message: this.message,
      mode: this.mode,
      allowWrites: this.allowWrites,
      projectPath: this.projectPath,
      maxRounds: this.maxRounds,
      executionMode: this.executionMode,
    };
  }
}

export class DeleteTaskDto {
  constructor(
    public readonly conversationId: string,
    public readonly taskId: string
  ) {}
}

export class CreateBacklogFromLeaderPlanDto {
  constructor(
    public readonly conversationId: string,
    public readonly leader: TeamMember,
    public readonly defaultAssigneeId: string,
    public readonly leaderOutput: string,
    public readonly replacementTaskId: string | null = null
  ) {}
}

export type PlannedBacklogTaskDto = {
  title: string;
  description: string;
  priority: number;
};
