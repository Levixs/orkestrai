import { FormRequest } from '@beeblock/svelar/forms';
import {
  applyDesignOperationsSchema,
  type ApplyDesignOperationsInput,
  importDesignAssetSchema,
  type ImportDesignAssetInput,
  exportDesignPdfSchema,
  type ExportDesignPdfInput,
  uploadDesignThumbnailSchema,
  type UploadDesignThumbnailInput,
} from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';

export class ApplyDesignOperationsRequest extends FormRequest {
  rules() {
    return applyDesignOperationsSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): ApplyDesignOperationsInput {
    return applyDesignOperationsSchema.parse(data);
  }
}

export class ExportDesignPdfRequest extends FormRequest {
  rules() {
    return exportDesignPdfSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): ExportDesignPdfInput {
    return exportDesignPdfSchema.parse(data);
  }
}

export class ImportDesignAssetRequest extends FormRequest {
  rules() {
    return importDesignAssetSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): ImportDesignAssetInput {
    return importDesignAssetSchema.parse(data);
  }
}

export class UploadDesignThumbnailRequest extends FormRequest {
  rules() {
    return uploadDesignThumbnailSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): UploadDesignThumbnailInput {
    return uploadDesignThumbnailSchema.parse(data);
  }
}
