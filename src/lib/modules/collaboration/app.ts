import { CollaborationAuditEvent } from './domain/models/CollaborationAuditEvent.js';
import { CollaborationCommand } from './domain/models/CollaborationCommand.js';
import { CollaborationDevice } from './domain/models/CollaborationDevice.js';
import { CollaborationShare } from './domain/models/CollaborationShare.js';

const lifecycle = globalThis as typeof globalThis & {
  __orkestraiDeleteCollaborationWorkspace?: (workspaceId: string) => Promise<void>;
};

lifecycle.__orkestraiDeleteCollaborationWorkspace = async (workspaceId) => {
  const shares = await CollaborationShare.query().where('workspace_id', workspaceId).pluck('id');
  for (const shareId of shares) {
    await CollaborationCommand.query().where('share_id', shareId).delete();
    await CollaborationDevice.query().where('share_id', shareId).delete();
  }
  await CollaborationAuditEvent.query().where('workspace_id', workspaceId).delete();
  await CollaborationShare.query().where('workspace_id', workspaceId).delete();
};
