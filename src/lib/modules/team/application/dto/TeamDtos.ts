import type {
  CancelTeamInvitationInput,
  InviteTeamMemberInput,
  RemoveTeamMemberInput,
  UpdateTeamInput,
  UpdateTeamMemberRoleInput,
} from '$lib/modules/team/contracts/schemas/team.schema.js';

export class InviteTeamMemberDto {
  constructor(
    public readonly teamId: string,
    public readonly email: string,
    public readonly role: 'member' | 'admin'
  ) {}

  static from(input: InviteTeamMemberInput): InviteTeamMemberDto {
    return new InviteTeamMemberDto(input.teamId, input.email, input.role);
  }
}

export class UpdateTeamDto {
  constructor(
    public readonly teamId: string,
    public readonly name: string
  ) {}

  static from(input: UpdateTeamInput): UpdateTeamDto {
    return new UpdateTeamDto(input.teamId, input.name);
  }
}

export class UpdateTeamMemberRoleDto {
  constructor(
    public readonly teamId: string,
    public readonly userId: string,
    public readonly role: 'member' | 'admin'
  ) {}

  static from(input: UpdateTeamMemberRoleInput): UpdateTeamMemberRoleDto {
    return new UpdateTeamMemberRoleDto(input.teamId, input.userId, input.role);
  }
}

export class RemoveTeamMemberDto {
  constructor(
    public readonly teamId: string,
    public readonly userId: string
  ) {}

  static from(input: RemoveTeamMemberInput): RemoveTeamMemberDto {
    return new RemoveTeamMemberDto(input.teamId, input.userId);
  }
}

export class CancelTeamInvitationDto {
  constructor(public readonly invitationId: string) {}

  static from(input: CancelTeamInvitationInput): CancelTeamInvitationDto {
    return new CancelTeamInvitationDto(input.invitationId);
  }
}
