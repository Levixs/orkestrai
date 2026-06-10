import { Action } from '@beeblock/svelar/actions';
import { Teams } from '@beeblock/svelar/teams';
import type {
  CancelTeamInvitationDto,
  InviteTeamMemberDto,
  RemoveTeamMemberDto,
  UpdateTeamDto,
  UpdateTeamMemberRoleDto,
} from '$lib/modules/team/application/dto/TeamDtos.js';

export class InviteTeamMemberAction extends Action<InviteTeamMemberDto, void> {
  async execute(dto: InviteTeamMemberDto): Promise<void> {
    await Teams.invite(dto.teamId, dto.email, dto.role);
  }
}

export class UpdateTeamAction extends Action<UpdateTeamDto, void> {
  async execute(dto: UpdateTeamDto): Promise<void> {
    await Teams.update(dto.teamId, { name: dto.name });
  }
}

export class UpdateTeamMemberRoleAction extends Action<UpdateTeamMemberRoleDto, void> {
  async execute(dto: UpdateTeamMemberRoleDto): Promise<void> {
    await Teams.updateMemberRole(dto.teamId, dto.userId, dto.role);
  }
}

export class RemoveTeamMemberAction extends Action<RemoveTeamMemberDto, void> {
  async execute(dto: RemoveTeamMemberDto): Promise<void> {
    await Teams.removeMember(dto.teamId, dto.userId);
  }
}

export class CancelTeamInvitationAction extends Action<CancelTeamInvitationDto, void> {
  async execute(dto: CancelTeamInvitationDto): Promise<void> {
    await Teams.cancelInvitation(dto.invitationId);
  }
}
