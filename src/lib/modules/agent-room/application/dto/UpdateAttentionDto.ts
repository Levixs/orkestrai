import type { AgentAttentionStatus } from '../../domain/types.js';
import type { UpdateAttentionInput } from '../../contracts/schemas/attention.schema.js';

export class UpdateAttentionDto {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly status: AgentAttentionStatus,
    public readonly snoozedUntil: string | null,
  ) {}

  static from(id: string, input: UpdateAttentionInput): UpdateAttentionDto {
    return new UpdateAttentionDto(
      id,
      input.workspaceId,
      input.status,
      input.snoozedUntil ?? null,
    );
  }
}
