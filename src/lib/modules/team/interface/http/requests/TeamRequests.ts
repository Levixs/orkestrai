import { FormRequest } from '@beeblock/svelar/forms';
import {
  cancelTeamInvitationSchema,
  inviteTeamMemberSchema,
  removeTeamMemberSchema,
  updateTeamMemberRoleSchema,
  updateTeamSchema,
} from '$lib/modules/team/contracts/schemas/team.schema.js';
import {
  CancelTeamInvitationDto,
  InviteTeamMemberDto,
  RemoveTeamMemberDto,
  UpdateTeamDto,
  UpdateTeamMemberRoleDto,
} from '$lib/modules/team/application/dto/TeamDtos.js';

function ownsRequest(event: any): boolean {
  return !!event.locals.user;
}

export class InviteTeamMemberRequest extends FormRequest {
  rules() {
    return inviteTeamMemberSchema;
  }

  authorize(event: any): boolean {
    return ownsRequest(event);
  }

  passedValidation(data: any): InviteTeamMemberDto {
    return InviteTeamMemberDto.from(data);
  }
}

export class UpdateTeamRequest extends FormRequest {
  rules() {
    return updateTeamSchema;
  }

  authorize(event: any): boolean {
    return ownsRequest(event);
  }

  passedValidation(data: any): UpdateTeamDto {
    return UpdateTeamDto.from(data);
  }
}

export class UpdateTeamMemberRoleRequest extends FormRequest {
  rules() {
    return updateTeamMemberRoleSchema;
  }

  authorize(event: any): boolean {
    return ownsRequest(event);
  }

  passedValidation(data: any): UpdateTeamMemberRoleDto {
    return UpdateTeamMemberRoleDto.from(data);
  }
}

export class RemoveTeamMemberRequest extends FormRequest {
  rules() {
    return removeTeamMemberSchema;
  }

  authorize(event: any): boolean {
    return ownsRequest(event);
  }

  passedValidation(data: any): RemoveTeamMemberDto {
    return RemoveTeamMemberDto.from(data);
  }
}

export class CancelTeamInvitationRequest extends FormRequest {
  rules() {
    return cancelTeamInvitationSchema;
  }

  authorize(event: any): boolean {
    return ownsRequest(event);
  }

  passedValidation(data: any): CancelTeamInvitationDto {
    return CancelTeamInvitationDto.from(data);
  }
}
