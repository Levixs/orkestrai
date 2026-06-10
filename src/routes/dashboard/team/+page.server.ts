import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { Teams } from '@beeblock/svelar/teams';
import {
  CancelTeamInvitationAction,
  InviteTeamMemberAction,
  RemoveTeamMemberAction,
  UpdateTeamAction,
  UpdateTeamMemberRoleAction,
} from '$lib/modules/team/application/actions/TeamActions.js';
import {
  CancelTeamInvitationRequest,
  InviteTeamMemberRequest,
  RemoveTeamMemberRequest,
  UpdateTeamMemberRoleRequest,
  UpdateTeamRequest,
} from '$lib/modules/team/interface/http/requests/TeamRequests.js';

const inviteTeamMemberRequest = new InviteTeamMemberRequest();
const updateTeamRequest = new UpdateTeamRequest();
const updateTeamMemberRoleRequest = new UpdateTeamMemberRoleRequest();
const removeTeamMemberRequest = new RemoveTeamMemberRequest();
const cancelTeamInvitationRequest = new CancelTeamInvitationRequest();
const inviteTeamMemberAction = new InviteTeamMemberAction();
const updateTeamAction = new UpdateTeamAction();
const updateTeamMemberRoleAction = new UpdateTeamMemberRoleAction();
const removeTeamMemberAction = new RemoveTeamMemberAction();
const cancelTeamInvitationAction = new CancelTeamInvitationAction();

async function authorize(dto: { authorize(event: any): boolean | Promise<boolean> }, event: any) {
  if (!await dto.authorize(event)) {
    return fail(403, { message: 'This action is unauthorized.' });
  }
  return null;
}

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user as any;

  let teams: any[] = [];
  try {
    teams = await Teams.getUserTeams(user.id);
  } catch {}

  if (teams.length === 0) {
    try {
      const team = await Teams.create({
        name: user.name + "'s Team",
        ownerId: user.id,
        personalTeam: true,
      });
      teams = [team];
    } catch {}
  }

  const currentTeam = teams[0] ?? null;
  let members: any[] = [];
  let invitations: any[] = [];

  if (currentTeam) {
    try { members = await Teams.getMembers(currentTeam.id); } catch {}
    try { invitations = await Teams.getPendingInvitations(currentTeam.id); } catch {}
  }

  return {
    user: { id: user.id, name: user.name, email: user.email },
    team: currentTeam ? { id: currentTeam.id, name: currentTeam.name, slug: currentTeam.slug } : null,
    members: members.map((m: any) => ({ id: m.id, userId: m.userId, role: m.role, joinedAt: m.joinedAt })),
    invitations: invitations.map((i: any) => ({ id: i.id, email: i.email, role: i.role, createdAt: i.createdAt, expiresAt: i.expiresAt })),
    inviteForm: await superValidate({ teamId: currentTeam?.id ?? '', role: 'member' }, zod(inviteTeamMemberRequest.rules()), { id: 'invite-team-member' }),
    updateTeamForm: await superValidate({ teamId: currentTeam?.id ?? '', name: currentTeam?.name ?? '' }, zod(updateTeamRequest.rules()), { id: 'update-team' }),
    updateRoleForm: await superValidate(zod(updateTeamMemberRoleRequest.rules()), { id: 'update-team-role' }),
    removeMemberForm: await superValidate(zod(removeTeamMemberRequest.rules()), { id: 'remove-team-member' }),
    cancelInvitationForm: await superValidate(zod(cancelTeamInvitationRequest.rules()), { id: 'cancel-team-invitation' }),
  };
};

export const actions: Actions = {
  invite: async (event) => {
    const unauthorized = await authorize(inviteTeamMemberRequest, event);
    if (unauthorized) return unauthorized;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(inviteTeamMemberRequest.rules()), { id: 'invite-team-member' });
    if (!validated.valid) return fail(422, { inviteForm: validated });
    const dto = inviteTeamMemberRequest.passedValidation(validated.data);
    try {
      await inviteTeamMemberAction.run(dto);
      return { success: true, inviteForm: validated, invited: dto.email };
    } catch (err: any) {
      return fail(500, { error: err.message || 'Failed to send invitation' });
    }
  },

  updateRole: async (event) => {
    const unauthorized = await authorize(updateTeamMemberRoleRequest, event);
    if (unauthorized) return unauthorized;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(updateTeamMemberRoleRequest.rules()), { id: 'update-team-role' });
    if (!validated.valid) return fail(422, { updateRoleForm: validated });
    try {
      await updateTeamMemberRoleAction.run(updateTeamMemberRoleRequest.passedValidation(validated.data));
      return { success: true };
    } catch (err: any) {
      return fail(500, { error: err.message || 'Failed to update role' });
    }
  },

  removeMember: async (event) => {
    const unauthorized = await authorize(removeTeamMemberRequest, event);
    if (unauthorized) return unauthorized;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(removeTeamMemberRequest.rules()), { id: 'remove-team-member' });
    if (!validated.valid) return fail(422, { removeMemberForm: validated });
    try {
      await removeTeamMemberAction.run(removeTeamMemberRequest.passedValidation(validated.data));
      return { success: true, removed: true };
    } catch (err: any) {
      return fail(500, { error: err.message || 'Failed to remove member' });
    }
  },

  cancelInvitation: async (event) => {
    const unauthorized = await authorize(cancelTeamInvitationRequest, event);
    if (unauthorized) return unauthorized;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(cancelTeamInvitationRequest.rules()), { id: 'cancel-team-invitation' });
    if (!validated.valid) return fail(422, { cancelInvitationForm: validated });
    try {
      await cancelTeamInvitationAction.run(cancelTeamInvitationRequest.passedValidation(validated.data));
      return { success: true, cancelled: true };
    } catch (err: any) {
      return fail(500, { error: err.message || 'Failed to cancel invitation' });
    }
  },

  updateTeam: async (event) => {
    const unauthorized = await authorize(updateTeamRequest, event);
    if (unauthorized) return unauthorized;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(updateTeamRequest.rules()), { id: 'update-team' });
    if (!validated.valid) return fail(422, { updateTeamForm: validated });
    try {
      await updateTeamAction.run(updateTeamRequest.passedValidation(validated.data));
      return { success: true, updateTeamForm: validated, updated: true };
    } catch (err: any) {
      return fail(500, { error: err.message || 'Failed to update team' });
    }
  },
};
