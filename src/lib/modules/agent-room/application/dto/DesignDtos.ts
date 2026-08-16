import type { ApplyDesignOperationsInput, DesignOperation } from '../../contracts/schemas/designSchemas.js';

export class ApplyDesignOperationsDto {
  constructor(
    public readonly workspaceId: string,
    public readonly nodeId: string,
    public readonly baseRevision: number,
    public readonly operations: DesignOperation[],
    public readonly actor: ApplyDesignOperationsInput['actor'],
    public readonly summary: string,
  ) {}

  static from(workspaceId: string, nodeId: string, input: ApplyDesignOperationsInput): ApplyDesignOperationsDto {
    return new ApplyDesignOperationsDto(
      workspaceId,
      nodeId,
      input.baseRevision,
      input.operations,
      input.actor,
      input.summary,
    );
  }
}
