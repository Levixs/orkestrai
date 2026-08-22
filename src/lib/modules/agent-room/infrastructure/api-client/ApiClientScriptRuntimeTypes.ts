import type { ApiClientRequestInput } from '../../contracts/schemas/apiClient.schema.js';
import type { ApiClientNodePayload } from '../../domain/types.js';
import type { ApiClientFolder } from '../../domain/types.js';
import type { ApiClientScriptResponse, ApiClientScriptStage } from './ApiClientScriptSandbox.js';

export type ApiClientScriptDialect = 'orkestrai' | 'postman' | 'bruno';

export type ApiClientScriptScopes = {
  collection: Record<string, unknown>;
  environment: Record<string, unknown>;
  globals: Record<string, unknown>;
  runtime: Record<string, unknown>;
  iteration: Record<string, unknown>;
};

export type ApiClientScriptFlow = {
  nextRequest: string | null | undefined;
  skipRequest: boolean;
  stopExecution: boolean;
};

export type ApiClientScriptTest = {
  id: string;
  label: string;
  passed: boolean;
  actual: string;
  expected: string;
};

export type ApiClientScriptVisualization = {
  type: 'html' | 'table';
  content: string;
  data?: unknown;
};

export type ApiClientRuntimeResult = {
  request: ApiClientRequestInput;
  response?: ApiClientScriptResponse;
  scopes: ApiClientScriptScopes;
  logs: string[];
  tests: ApiClientScriptTest[];
  flow: ApiClientScriptFlow;
  visualizations: ApiClientScriptVisualization[];
  cookies?: NonNullable<ApiClientNodePayload['network']>['cookies'];
  secrets?: Record<string, string>;
};

export type ApiClientScriptContext = {
  stage: ApiClientScriptStage;
  request: ApiClientRequestInput;
  response?: ApiClientScriptResponse;
  scopes: ApiClientScriptScopes;
  script: string;
  collectionName: string;
  collectionPath?: string | null;
  iterationIndex?: number;
  iterationCount?: number;
  folderVariables?: Record<string, unknown>;
  requestVariables?: Record<string, unknown>;
  requests?: ApiClientRequestInput[];
  folders?: ApiClientFolder[];
  collectionPreRequestScript?: string;
  collectionPostResponseScript?: string;
  network: NonNullable<ApiClientNodePayload['network']>;
  secrets?: Record<string, string>;
  runRequest?: (reference: string) => Promise<ApiClientRuntimeResult>;
};

export function emptyScriptFlow(): ApiClientScriptFlow {
  return { nextRequest: undefined, skipRequest: false, stopExecution: false };
}

export function mergeScriptScopes(scopes: Partial<ApiClientScriptScopes>): ApiClientScriptScopes {
  return {
    collection: { ...(scopes.collection ?? {}) },
    environment: { ...(scopes.environment ?? {}) },
    globals: { ...(scopes.globals ?? {}) },
    runtime: { ...(scopes.runtime ?? {}) },
    iteration: { ...(scopes.iteration ?? {}) },
  };
}
