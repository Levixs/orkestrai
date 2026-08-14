import { z } from '@beeblock/svelar/validation';

export const collaborationRoleSchema = z.enum(['viewer', 'collaborator', 'operator', 'administrator']);

export const createCollaborationShareSchema = z.object({
  defaultRole: collaborationRoleSchema.default('viewer'),
  expiresInMinutes: z.coerce.number().int().min(5).max(24 * 60).default(15),
  maxPeers: z.coerce.number().int().min(1).max(5).default(5),
  relayUrl: z.string().url().max(500),
}).strict();

export const collaborationJoinRequestSchema = z.object({
  deviceId: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().trim().min(1).max(80),
  platform: z.enum(['darwin', 'win32', 'linux']),
  requestedRole: collaborationRoleSchema.default('viewer'),
  guestNonce: z.string().min(40).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  appVersion: z.string().min(1).max(32),
}).strict();

export const approveCollaborationDeviceSchema = z.object({
  approved: z.boolean(),
  role: collaborationRoleSchema.default('viewer'),
}).strict();

const taskCreateCommandSchema = z.object({
  type: z.literal('task.create'),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(20_000).nullish(),
  status: z.string().trim().min(1).max(80).optional(),
  assigneeNodeId: z.string().uuid().nullish(),
}).strict();

const taskUpdateCommandSchema = z.object({
  type: z.literal('task.update'),
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(20_000).nullish(),
  status: z.string().trim().min(1).max(80).optional(),
  assigneeNodeId: z.string().uuid().nullish(),
}).strict();

const reviewDecisionCommandSchema = z.object({
  type: z.literal('review.decide'),
  reviewId: z.string().uuid(),
  status: z.enum(['approved', 'changes_requested', 'rejected']),
  note: z.string().trim().max(4_000).nullish(),
}).strict();

const leaderMessageCommandSchema = z.object({
  type: z.literal('leader.message'),
  message: z.string().trim().min(1).max(10_000),
}).strict();

export const collaborationCommandSchema = z.discriminatedUnion('type', [
  taskCreateCommandSchema,
  taskUpdateCommandSchema,
  reviewDecisionCommandSchema,
  leaderMessageCommandSchema,
]);

export const executeCollaborationCommandSchema = z.object({
  commandId: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  revision: z.number().int().nonnegative(),
  command: collaborationCommandSchema,
}).strict();

export const joinRemoteCollaborationSchema = z.object({
  inviteUri: z.string().trim().min(60).max(1_000).regex(/^orkestrai:\/\/join\/[a-zA-Z0-9_-]+#[a-zA-Z0-9_-]{43}$/),
  relayUrl: z.string().url().max(500),
  displayName: z.string().trim().min(1).max(80),
  platform: z.enum(['darwin', 'win32', 'linux']),
}).strict();

export const sendRemoteCollaborationCommandSchema = collaborationCommandSchema;

export type CreateCollaborationShareInput = z.infer<typeof createCollaborationShareSchema>;
export type CollaborationJoinRequestInput = z.infer<typeof collaborationJoinRequestSchema>;
export type ApproveCollaborationDeviceInput = z.infer<typeof approveCollaborationDeviceSchema>;
export type ExecuteCollaborationCommandInput = z.infer<typeof executeCollaborationCommandSchema>;
export type JoinRemoteCollaborationInput = z.infer<typeof joinRemoteCollaborationSchema>;
export type SendRemoteCollaborationCommandInput = z.infer<typeof sendRemoteCollaborationCommandSchema>;
