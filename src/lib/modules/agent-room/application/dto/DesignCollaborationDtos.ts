import type {
  DesignPresenceHeartbeatInput,
  LeaveDesignPresenceInput,
} from '../../contracts/schemas/designSchemas.js';

export class DesignPresenceHeartbeatDto {
  constructor(
    public readonly workspaceId: string,
    public readonly nodeId: string,
    public readonly input: DesignPresenceHeartbeatInput,
  ) {}

  static from(workspaceId: string, nodeId: string, input: DesignPresenceHeartbeatInput): DesignPresenceHeartbeatDto {
    return new DesignPresenceHeartbeatDto(workspaceId, nodeId, input);
  }
}

export class LeaveDesignPresenceDto {
  constructor(
    public readonly workspaceId: string,
    public readonly nodeId: string,
    public readonly participantId: string,
  ) {}

  static from(workspaceId: string, nodeId: string, input: LeaveDesignPresenceInput): LeaveDesignPresenceDto {
    return new LeaveDesignPresenceDto(workspaceId, nodeId, input.participantId);
  }
}
