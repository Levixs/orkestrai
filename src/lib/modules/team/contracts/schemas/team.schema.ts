import { z } from '@beeblock/svelar/validation';

export const inviteTeamMemberSchema = z.object({
  teamId: z.string().trim().min(1, 'Team is required'),
  email: z.string().trim().email('Enter a valid email address'),
  role: z.enum(['member', 'admin']).default('member'),
});

export const updateTeamSchema = z.object({
  teamId: z.string().trim().min(1, 'Team is required'),
  name: z.string().trim().min(2, 'Team name must be at least 2 characters').max(120),
});

export const updateTeamMemberRoleSchema = z.object({
  teamId: z.string().trim().min(1, 'Team is required'),
  userId: z.string().trim().min(1, 'User is required'),
  role: z.enum(['member', 'admin']),
});

export const removeTeamMemberSchema = z.object({
  teamId: z.string().trim().min(1, 'Team is required'),
  userId: z.string().trim().min(1, 'User is required'),
});

export const cancelTeamInvitationSchema = z.object({
  invitationId: z.string().trim().min(1, 'Invitation is required'),
});

export type InviteTeamMemberInput = z.infer<typeof inviteTeamMemberSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type UpdateTeamMemberRoleInput = z.infer<typeof updateTeamMemberRoleSchema>;
export type RemoveTeamMemberInput = z.infer<typeof removeTeamMemberSchema>;
export type CancelTeamInvitationInput = z.infer<typeof cancelTeamInvitationSchema>;
