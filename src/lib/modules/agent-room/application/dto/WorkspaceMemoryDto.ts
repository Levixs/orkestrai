import type { ReviseWorkspaceMemoryInput, SaveWorkspaceMemoryInput } from '../../contracts/schemas/workspace-memory.schema.js';

export class SaveWorkspaceMemoryDto {
  constructor(public readonly workspaceId: string, public readonly input: SaveWorkspaceMemoryInput) {}
}

export class ReviseWorkspaceMemoryDto {
  constructor(public readonly workspaceId: string, public readonly id: string, public readonly input: ReviseWorkspaceMemoryInput) {}
}

export class ArchiveWorkspaceMemoryDto {
  constructor(public readonly workspaceId: string, public readonly id: string) {}
}
