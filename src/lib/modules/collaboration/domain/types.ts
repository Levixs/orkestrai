export type CollaborationRole = 'viewer' | 'collaborator' | 'operator' | 'administrator';

export type CollaborationScope =
  | 'workspace.view'
  | 'activity.view'
  | 'tasks.view'
  | 'tasks.write'
  | 'approvals.view'
  | 'approvals.decide'
  | 'leader.message'
  | 'peers.manage';

export type CollaborationShareStatus = 'active' | 'stopped' | 'expired';

export type CollaborationShareData = {
  id: string;
  workspaceId: string;
  status: CollaborationShareStatus;
  defaultRole: CollaborationRole;
  relayUrl: string;
  relayRegion: string | null;
  maxPeers: number;
  revision: number;
  expiresAt: string;
  startedAt: string;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CollaborationDeviceData = {
  id: string;
  shareId: string;
  workspaceId: string;
  deviceId: string;
  displayName: string;
  platform: 'darwin' | 'win32' | 'linux' | 'ios' | 'android' | 'web';
  fingerprint: string;
  role: CollaborationRole;
  scopes: CollaborationScope[];
  requestedAt: string;
  approvedAt: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
};

export type CollaborationAuditData = {
  id: string;
  workspaceId: string;
  shareId: string | null;
  actorDeviceId: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SharedCanvasNodeDto = {
  id: string;
  type: 'agent' | 'tasks' | 'group' | 'shape' | 'control' | 'review' | 'automation';
  title: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  floorId: string | null;
  visual: Record<string, string | number | boolean | null>;
};

export type SharedWorkspaceDto = {
  shareId: string;
  revision: number;
  workspace: { name: string; icon: string | null };
  nodes: SharedCanvasNodeDto[];
  edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string; style: string }>;
  columns: Array<{ id: string; key: string; name: string | null; color: string; position: number }>;
  tasks: Array<{
    id: string; title: string; description: string | null; status: string;
    assigneeNodeId: string | null; assigneeTitle: string | null; createdAt: string; updatedAt: string;
  }>;
  agents: Array<{
    id: string; title: string; provider: string | null; role: string | null;
    state: string; stateSince: string; currentTask: { id: string; title: string; status: string } | null;
  }>;
  floors: Array<{ id: string; name: string; status: string; activeTasks: number; activeAgents: number }>;
  roles: Array<{ name: string; agentCount: number }>;
  reviews: Array<{
    id: string; title: string; summary: string | null; status: string; taskTitle: string | null;
    assigneeTitle: string | null; evidenceCount: number; testCount: number; riskCount: number;
    decidedAt: string | null; createdAt: string; updatedAt: string;
  }>;
  usage: Array<{
    provider: 'claude' | 'codex' | 'kimi';
    plan: string | null;
    windows: Array<{ kind: '5h' | 'weekly' | 'monthly'; usedPercent: number; resetsAt: string | null }>;
    available: boolean;
    fetchedAt: string;
  }>;
  activity: Array<{
    id: string;
    kind: 'agent' | 'task' | 'review';
    title: string;
    detail: string | null;
    state: string;
    occurredAt: string;
  }>;
  generatedAt: string;
};

export type CollaborationCommand =
  | { type: 'task.create'; title: string; description?: string | null; status?: string; assigneeNodeId?: string | null }
  | { type: 'task.update'; taskId: string; title?: string; description?: string | null; status?: string; assigneeNodeId?: string | null }
  | { type: 'review.decide'; reviewId: string; status: 'approved' | 'changes_requested' | 'rejected'; note?: string | null }
  | { type: 'leader.message'; message: string };

export type CollaborationCommandResult = {
  commandId: string;
  accepted: boolean;
  revision: number;
  result: Record<string, unknown> | null;
  errorCode: string | null;
};
