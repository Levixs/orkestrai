import type { ApplyDesignOperationsInput, DesignOperation, DesignVisualReviewInput, ExportDesignPdfInput, ImportDesignAssetInput, UploadDesignThumbnailInput } from '../../contracts/schemas/designSchemas.js';

export class ReviewDesignDto {
  constructor(
    public readonly workspaceId: string,
    public readonly nodeId: string,
    public readonly status: DesignVisualReviewInput['status'],
    public readonly revision: number,
    public readonly note: string,
  ) {}

  static from(workspaceId: string, nodeId: string, input: DesignVisualReviewInput): ReviewDesignDto {
    return new ReviewDesignDto(workspaceId, nodeId, input.status, input.revision, input.note);
  }
}

export class ApplyDesignOperationsDto {
  constructor(
    public readonly workspaceId: string,
    public readonly nodeId: string,
    public readonly baseRevision: number,
    public readonly operations: DesignOperation[],
    public readonly actor: ApplyDesignOperationsInput['actor'],
    public readonly summary: string,
    public readonly collaborationParticipantId: string | null = null,
  ) {}

  static from(workspaceId: string, nodeId: string, input: ApplyDesignOperationsInput): ApplyDesignOperationsDto {
    return new ApplyDesignOperationsDto(
      workspaceId,
      nodeId,
      input.baseRevision,
      input.operations,
      input.actor,
      input.summary,
      input.collaborationParticipantId,
    );
  }
}

export class ExportDesignPdfDto {
  constructor(
    public readonly dataUrl: string,
    public readonly width: number,
    public readonly height: number,
    public readonly name: string,
  ) {}

  static from(input: ExportDesignPdfInput): ExportDesignPdfDto {
    return new ExportDesignPdfDto(input.dataUrl, input.width, input.height, input.name);
  }
}

export class ImportDesignAssetDto {
  constructor(
    public readonly workspaceId: string,
    public readonly nodeId: string,
    public readonly file: File,
    public readonly baseRevision: number,
    public readonly width: number | null,
    public readonly height: number | null,
  ) {}

  static from(workspaceId: string, nodeId: string, input: ImportDesignAssetInput): ImportDesignAssetDto {
    return new ImportDesignAssetDto(
      workspaceId,
      nodeId,
      input.file,
      input.baseRevision,
      input.width,
      input.height,
    );
  }
}

export class UploadDesignThumbnailDto {
  constructor(
    public readonly workspaceId: string,
    public readonly nodeId: string,
    public readonly file: File,
    public readonly revision: number,
  ) {}

  static from(workspaceId: string, nodeId: string, input: UploadDesignThumbnailInput): UploadDesignThumbnailDto {
    return new UploadDesignThumbnailDto(workspaceId, nodeId, input.file, input.revision);
  }
}
