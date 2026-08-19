import { FormRequest } from '@beeblock/svelar/forms';
import {
  importDesignLibrarySchema,
  publishDesignLibrarySchema,
  type ImportDesignLibraryInput,
  type PublishDesignLibraryInput,
} from '$lib/modules/agent-room/contracts/schemas/designLibrarySchemas.js';

export class PublishDesignLibraryRequest extends FormRequest {
  rules() {
    return publishDesignLibrarySchema;
  }
  authorize(): boolean {
    return true;
  }
  passedValidation(data: unknown): PublishDesignLibraryInput {
    return publishDesignLibrarySchema.parse(data);
  }
}

export class ImportDesignLibraryRequest extends FormRequest {
  rules() {
    return importDesignLibrarySchema;
  }
  authorize(): boolean {
    return true;
  }
  passedValidation(data: unknown): ImportDesignLibraryInput {
    return importDesignLibrarySchema.parse(data);
  }
}
