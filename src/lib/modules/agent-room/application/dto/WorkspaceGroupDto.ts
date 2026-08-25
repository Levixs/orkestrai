import type { CreateWorkspaceGroupInput, MoveWorkspaceInput, UpdateWorkspaceGroupInput } from '../../contracts/schemas/workspaceGroupSchemas.js';

export class CreateWorkspaceGroupDto {
  constructor(
    public readonly name: string,
    public readonly parentId: string | null,
  ) {}

  static from(input: CreateWorkspaceGroupInput): CreateWorkspaceGroupDto {
    return new CreateWorkspaceGroupDto(input.name, input.parentId ?? null);
  }
}

export class UpdateWorkspaceGroupDto {
  constructor(
    public readonly name: string | undefined,
    public readonly parentId: string | null | undefined,
  ) {}

  static from(input: UpdateWorkspaceGroupInput): UpdateWorkspaceGroupDto {
    return new UpdateWorkspaceGroupDto(input.name, input.parentId);
  }
}

export class MoveWorkspaceDto {
  constructor(public readonly groupId: string | null) {}

  static from(input: MoveWorkspaceInput): MoveWorkspaceDto {
    return new MoveWorkspaceDto(input.groupId ?? null);
  }
}
