import type { KillManagedPortInput } from '$lib/modules/agent-room/contracts/schemas/kill-managed-port.schema.js';

export class KillManagedPortDto {
  constructor(
    public readonly workspaceId: string,
    public readonly port: number,
    public readonly pids: number[]
  ) {}

  static from(workspaceId: string, input: KillManagedPortInput): KillManagedPortDto {
    return new KillManagedPortDto(workspaceId, input.port, input.pids);
  }
}
