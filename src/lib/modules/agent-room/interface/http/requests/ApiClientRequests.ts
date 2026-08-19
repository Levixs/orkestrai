import { FormRequest } from '@beeblock/svelar/forms';
import {
  executeApiClientRequestSchema,
  executeSavedApiClientRequestSchema,
  importApiClientCollectionSchema,
  type ExecuteApiClientRequestInput,
  type ExecuteSavedApiClientRequestInput,
  type ImportApiClientCollectionInput,
} from '../../../contracts/schemas/apiClient.schema.js';

export class ExecuteApiClientRequest extends FormRequest {
  rules() { return executeApiClientRequestSchema; }
  authorize() { return true; }
  passedValidation(data: unknown): ExecuteApiClientRequestInput { return executeApiClientRequestSchema.parse(data); }
}

export class ImportApiClientCollectionRequest extends FormRequest {
  rules() { return importApiClientCollectionSchema; }
  authorize() { return true; }
  passedValidation(data: unknown): ImportApiClientCollectionInput { return importApiClientCollectionSchema.parse(data); }
}

export class ExecuteSavedApiClientRequest extends FormRequest {
  rules() { return executeSavedApiClientRequestSchema; }
  authorize() { return true; }
  passedValidation(data: unknown): ExecuteSavedApiClientRequestInput { return executeSavedApiClientRequestSchema.parse(data); }
}
