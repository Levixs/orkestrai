import { FormRequest } from '@beeblock/svelar/forms';
import {
  applyDesignFigmaSyncSchema,
  disconnectDesignFigmaSchema,
  importDesignFigmaSchema,
  inspectDesignFigmaSchema,
  previewDesignFigmaSyncSchema,
  type ApplyDesignFigmaSyncInput,
  type DisconnectDesignFigmaInput,
  type ImportDesignFigmaInput,
  type InspectDesignFigmaInput,
  type PreviewDesignFigmaSyncInput,
} from '../../../contracts/schemas/designFigmaSchemas.js';

abstract class AuthorizedRequest extends FormRequest {
  authorize(): boolean { return true; }
}

export class InspectDesignFigmaRequest extends AuthorizedRequest {
  rules() { return inspectDesignFigmaSchema; }
  passedValidation(data: unknown): InspectDesignFigmaInput { return inspectDesignFigmaSchema.parse(data); }
}

export class ImportDesignFigmaRequest extends AuthorizedRequest {
  rules() { return importDesignFigmaSchema; }
  passedValidation(data: unknown): ImportDesignFigmaInput { return importDesignFigmaSchema.parse(data); }
}

export class PreviewDesignFigmaSyncRequest extends AuthorizedRequest {
  rules() { return previewDesignFigmaSyncSchema; }
  passedValidation(data: unknown): PreviewDesignFigmaSyncInput { return previewDesignFigmaSyncSchema.parse(data); }
}

export class ApplyDesignFigmaSyncRequest extends AuthorizedRequest {
  rules() { return applyDesignFigmaSyncSchema; }
  passedValidation(data: unknown): ApplyDesignFigmaSyncInput { return applyDesignFigmaSyncSchema.parse(data); }
}

export class DisconnectDesignFigmaRequest extends AuthorizedRequest {
  rules() { return disconnectDesignFigmaSchema; }
  passedValidation(data: unknown): DisconnectDesignFigmaInput { return disconnectDesignFigmaSchema.parse(data); }
}
