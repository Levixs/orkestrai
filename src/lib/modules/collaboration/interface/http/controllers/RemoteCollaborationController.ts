import { Controller } from '@beeblock/svelar/routing';
import type { CollaborationCommand } from '../../../domain/types.js';
import { collaborationSessionManager } from '../../../application/services/CollaborationSessionManager.js';
import { JoinRemoteCollaborationRequest } from '../requests/JoinRemoteCollaborationRequest.js';
import { SendRemoteCollaborationCommandRequest } from '../requests/SendRemoteCollaborationCommandRequest.js';

export class RemoteCollaborationController extends Controller {
  async status() {
    return this.json({ data: collaborationSessionManager.guestStatus() });
  }

  async join(event: any) {
    try {
      const input = await JoinRemoteCollaborationRequest.validate(event);
      return this.json({ data: await collaborationSessionManager.join(input) }, 202);
    } catch (error) {
      return this.failure(error);
    }
  }

  async leave() {
    collaborationSessionManager.leaveGuest();
    return this.json({ data: { disconnected: true } });
  }

  async command(event: any) {
    try {
      const input = await SendRemoteCollaborationCommandRequest.validate(event);
      const result = await collaborationSessionManager.sendGuestCommand(input as CollaborationCommand);
      return this.json({ data: result }, result.accepted ? 200 : 409);
    } catch (error) {
      return this.failure(error);
    }
  }

  private failure(error: unknown) {
    const message = error instanceof Error ? error.message : 'REMOTE_COLLABORATION_REQUEST_FAILED';
    return this.json({ error: message }, message.includes('OFFLINE') ? 409 : 400);
  }
}
