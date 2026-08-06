import { Action } from '@beeblock/svelar/actions';
import { managedPortService } from '$lib/modules/agent-room/application/services/ManagedPortService.js';
import type { KillManagedPortDto } from '$lib/modules/agent-room/application/dto/KillManagedPortDto.js';

export class KillManagedPortAction extends Action<KillManagedPortDto, { port: number; killedPids: number[] }> {
  async execute(dto: KillManagedPortDto): Promise<{ port: number; killedPids: number[] }> {
    return managedPortService.kill(dto.workspaceId, dto.port, dto.pids);
  }
}
