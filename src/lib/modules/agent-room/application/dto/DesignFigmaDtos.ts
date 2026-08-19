import type {
  ApplyDesignFigmaSyncInput,
  ImportDesignFigmaInput,
  InspectDesignFigmaInput,
  PreviewDesignFigmaSyncInput,
} from '../../contracts/schemas/designFigmaSchemas.js';

export class InspectDesignFigmaDto {
  constructor(
    public readonly workspaceId: string,
    public readonly nodeId: string,
    public readonly url: string,
  ) {}

  static from(workspaceId: string, nodeId: string, input: InspectDesignFigmaInput) {
    return new InspectDesignFigmaDto(workspaceId, nodeId, input.url);
  }
}

export class ImportDesignFigmaDto {
  constructor(
    public readonly workspaceId: string,
    public readonly nodeId: string,
    public readonly url: string,
    public readonly sourceNodeIds: string[],
    public readonly baseRevision: number,
    public readonly targetPageId: string,
  ) {}

  static from(workspaceId: string, nodeId: string, input: ImportDesignFigmaInput) {
    return new ImportDesignFigmaDto(workspaceId, nodeId, input.url, input.sourceNodeIds, input.baseRevision, input.targetPageId);
  }
}

export class PreviewDesignFigmaSyncDto {
  constructor(
    public readonly workspaceId: string,
    public readonly nodeId: string,
    public readonly linkId: string,
  ) {}

  static from(workspaceId: string, nodeId: string, input: PreviewDesignFigmaSyncInput) {
    return new PreviewDesignFigmaSyncDto(workspaceId, nodeId, input.linkId);
  }
}

export class ApplyDesignFigmaSyncDto {
  constructor(
    public readonly workspaceId: string,
    public readonly nodeId: string,
    public readonly linkId: string,
    public readonly baseRevision: number,
    public readonly changes: ApplyDesignFigmaSyncInput['changes'],
  ) {}

  static from(workspaceId: string, nodeId: string, input: ApplyDesignFigmaSyncInput) {
    return new ApplyDesignFigmaSyncDto(workspaceId, nodeId, input.linkId, input.baseRevision, input.changes);
  }
}
