import type { WorkspaceSearchInput } from '$lib/modules/agent-room/contracts/schemas/workspaceSearchSchema.js';

export class WorkspaceSearchDto {
  constructor(
    public readonly query: string,
    public readonly workspaceId: string | null,
    public readonly includeFiles: boolean,
    public readonly limit: number,
  ) {}

  static from(input: WorkspaceSearchInput): WorkspaceSearchDto {
    return new WorkspaceSearchDto(
      input.q.trim(),
      input.workspaceId ?? null,
      input.includeFiles,
      input.limit,
    );
  }
}
