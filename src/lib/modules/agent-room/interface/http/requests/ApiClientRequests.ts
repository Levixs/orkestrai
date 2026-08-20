import { FormRequest } from '@beeblock/svelar/forms';
import {
  executeApiClientRequestSchema,
  executeSavedApiClientRequestSchema,
  apiClientOAuthSchema,
  apiClientSyncRequestSchema,
  exportApiClientCollectionSchema,
  importApiClientCollectionSchema,
  type ExecuteApiClientRequestInput,
  type ExecuteSavedApiClientRequestInput,
  type ApiClientOAuthInput,
  type ApiClientSyncRequestInput,
  type ExportApiClientCollectionInput,
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

export class ExportApiClientCollectionRequest extends FormRequest {
  rules() { return exportApiClientCollectionSchema; }
  authorize() { return true; }
  passedValidation(data: unknown): ExportApiClientCollectionInput { return exportApiClientCollectionSchema.parse(data); }
}

export class ExecuteSavedApiClientRequest extends FormRequest {
  rules() { return executeSavedApiClientRequestSchema; }
  authorize() { return true; }
  passedValidation(data: unknown): ExecuteSavedApiClientRequestInput { return executeSavedApiClientRequestSchema.parse(data); }
}

export class ApiClientOAuthRequest extends FormRequest {
  rules() { return apiClientOAuthSchema; }
  authorize() { return true; }
  passedValidation(data: unknown): ApiClientOAuthInput { return apiClientOAuthSchema.parse(data); }
}

export class ApiClientSyncRequest extends FormRequest {
  rules() { return apiClientSyncRequestSchema; }
  authorize() { return true; }
  passedValidation(data: unknown): ApiClientSyncRequestInput { return apiClientSyncRequestSchema.parse(data); }
}
