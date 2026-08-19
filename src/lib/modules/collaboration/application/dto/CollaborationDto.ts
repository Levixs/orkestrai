import type {
  ApproveCollaborationDeviceInput,
  CreateCollaborationShareInput,
  ExecuteCollaborationCommandInput,
} from '../../contracts/schemas/collaboration.schema.js';

export class CreateCollaborationShareDto {
  constructor(
    readonly defaultRole: CreateCollaborationShareInput['defaultRole'],
    readonly expiresInMinutes: number,
    readonly maxPeers: number,
    readonly relayUrl: string,
  ) {}

  static from(input: CreateCollaborationShareInput): CreateCollaborationShareDto {
    return new CreateCollaborationShareDto(input.defaultRole, input.expiresInMinutes, input.maxPeers, input.relayUrl);
  }
}

export class ApproveCollaborationDeviceDto {
  constructor(
    readonly approved: boolean,
    readonly role: ApproveCollaborationDeviceInput['role'],
    readonly terminalAccess: boolean,
    readonly designAccess: ApproveCollaborationDeviceInput['designAccess'],
  ) {}
  static from(input: ApproveCollaborationDeviceInput): ApproveCollaborationDeviceDto {
    return new ApproveCollaborationDeviceDto(input.approved, input.role, input.terminalAccess, input.designAccess);
  }
}

export class ExecuteCollaborationCommandDto {
  constructor(
    readonly commandId: string,
    readonly revision: number,
    readonly command: ExecuteCollaborationCommandInput['command'],
  ) {}
  static from(input: ExecuteCollaborationCommandInput): ExecuteCollaborationCommandDto {
    return new ExecuteCollaborationCommandDto(input.commandId, input.revision, input.command);
  }
}
