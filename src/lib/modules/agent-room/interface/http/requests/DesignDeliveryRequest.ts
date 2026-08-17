import { FormRequest } from '@beeblock/svelar/forms';
import {
  applyDesignDeliverySchema,
  captureDesignDeliverySchema,
  importDesignMarkupSchema,
  previewDesignDeliverySchema,
  type ApplyDesignDeliveryInput,
  type CaptureDesignDeliveryInput,
  type ImportDesignMarkupInput,
  type PreviewDesignDeliveryInput,
} from '../../../contracts/schemas/design-delivery.schema.js';

abstract class AuthorizedRequest extends FormRequest {
  authorize(): boolean { return true; }
}

export class PreviewDesignDeliveryRequest extends AuthorizedRequest {
  rules() { return previewDesignDeliverySchema; }
  passedValidation(data: unknown): PreviewDesignDeliveryInput { return previewDesignDeliverySchema.parse(data); }
}

export class ApplyDesignDeliveryRequest extends AuthorizedRequest {
  rules() { return applyDesignDeliverySchema; }
  passedValidation(data: unknown): ApplyDesignDeliveryInput { return applyDesignDeliverySchema.parse(data); }
}

export class ImportDesignMarkupRequest extends AuthorizedRequest {
  rules() { return importDesignMarkupSchema; }
  passedValidation(data: unknown): ImportDesignMarkupInput { return importDesignMarkupSchema.parse(data); }
}

export class CaptureDesignDeliveryRequest extends AuthorizedRequest {
  rules() { return captureDesignDeliverySchema; }
  passedValidation(data: unknown): CaptureDesignDeliveryInput { return captureDesignDeliverySchema.parse(data); }
}
