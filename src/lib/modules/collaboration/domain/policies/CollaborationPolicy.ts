import type { CollaborationRole, CollaborationScope } from '../types.js';

const ROLE_SCOPES: Record<CollaborationRole, readonly CollaborationScope[]> = {
  viewer: ['workspace.view', 'activity.view', 'tasks.view', 'approvals.view'],
  collaborator: ['workspace.view', 'activity.view', 'tasks.view', 'tasks.write', 'approvals.view'],
  operator: [
    'workspace.view', 'activity.view', 'tasks.view', 'tasks.write',
    'approvals.view', 'approvals.decide', 'leader.message',
  ],
  administrator: [
    'workspace.view', 'activity.view', 'tasks.view', 'tasks.write',
    'approvals.view', 'approvals.decide', 'leader.message', 'peers.manage',
  ],
};

const COMMAND_SCOPE = {
  'task.create': 'tasks.write',
  'task.update': 'tasks.write',
  'review.decide': 'approvals.decide',
  'leader.message': 'leader.message',
} as const satisfies Record<string, CollaborationScope>;

export class CollaborationPolicy {
  scopesForRole(role: CollaborationRole): CollaborationScope[] {
    return [...ROLE_SCOPES[role]];
  }

  can(scopes: readonly CollaborationScope[], scope: CollaborationScope): boolean {
    return scopes.includes(scope);
  }

  commandScope(type: keyof typeof COMMAND_SCOPE): CollaborationScope {
    return COMMAND_SCOPE[type];
  }
}

export const collaborationPolicy = new CollaborationPolicy();
