import { sample } from 'openapi-sampler';
import { apiClientAuthSchema, apiClientRequestSchema, type ApiClientRequestInput } from '../contracts/schemas/apiClient.schema.js';
import type { ApiClientFolder } from './types.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

export type ApiClientCompatibilityWarning = {
  code: string;
  count?: number;
};

export type OpenApiImportResult = {
  name: string;
  requests: ApiClientRequestInput[];
  folders: ApiClientFolder[];
  variables: Record<string, string>;
  warnings: ApiClientCompatibilityWarning[];
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function localReference(document: any, value: any): any {
  if (!value || typeof value !== 'object' || typeof value.$ref !== 'string' || !value.$ref.startsWith('#/')) return value;
  let current = document;
  for (const rawSegment of value.$ref.slice(2).split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    current = current?.[segment];
  }
  return current ?? value;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return String(value);
}

function serverUrl(server: any): string {
  let url = text(server?.url);
  for (const [name, variable] of Object.entries(server?.variables ?? {})) {
    url = url.replaceAll(`{${name}}`, text((variable as any)?.default));
  }
  return url.replace(/\/$/, '');
}

function swaggerBaseUrl(document: any): string {
  const scheme = Array.isArray(document.schemes) && document.schemes.length ? document.schemes[0] : 'https';
  const host = text(document.host);
  const basePath = text(document.basePath).replace(/\/$/, '');
  return host ? `${scheme}://${host}${basePath}` : basePath;
}

function parameterValue(parameter: any, document: any): string {
  const resolved = localReference(document, parameter);
  const schema = localReference(document, resolved?.schema);
  const value = resolved?.example ?? schema?.example ?? schema?.default ?? resolved?.default;
  if (value !== undefined) return typeof value === 'object' ? JSON.stringify(value) : text(value);
  if (schema) {
    try {
      const generated = sample(schema, { skipReadOnly: true }, document);
      return typeof generated === 'object' ? JSON.stringify(generated) : text(generated);
    } catch { /* A missing example should not block the endpoint import. */ }
  }
  return '';
}

function securityScheme(document: any, operation: any): { scheme: any; name: string } | null {
  const security = operation.security ?? document.security;
  if (!Array.isArray(security) || !security.length) return null;
  const name = Object.keys(security[0] ?? {})[0];
  if (!name) return null;
  const registry = document.swagger === '2.0' ? document.securityDefinitions : document.components?.securitySchemes;
  return { name, scheme: localReference(document, registry?.[name]) };
}

function importedAuth(document: any, operation: any): ApiClientRequestInput['auth'] {
  const selected = securityScheme(document, operation);
  const empty = apiClientAuthSchema.parse({ type: 'none' });
  if (!selected?.scheme) return empty;
  const scheme = selected.scheme;
  if (scheme.type === 'http' && String(scheme.scheme).toLowerCase() === 'basic' || scheme.type === 'basic') {
    return { ...empty, type: 'basic', username: '{{username}}', password: '{{password}}' };
  }
  if (scheme.type === 'http' && String(scheme.scheme).toLowerCase() === 'bearer') {
    return { ...empty, type: 'bearer', token: '{{accessToken}}' };
  }
  if (scheme.type === 'oauth2' || scheme.type === 'openIdConnect') {
    return { ...empty, type: 'bearer', token: '{{accessToken}}' };
  }
  if (scheme.type === 'apiKey') {
    return {
      ...empty,
      type: 'apiKey',
      key: text(scheme.name || selected.name),
      value: `{{${selected.name}}}`,
      placement: scheme.in === 'query' ? 'query' : 'header',
    };
  }
  return empty;
}

function bodyExample(media: any, document: any): unknown {
  if (!media) return undefined;
  if (media.example !== undefined) return media.example;
  const firstExample = Object.values(media.examples ?? {})[0] as any;
  if (firstExample?.value !== undefined) return firstExample.value;
  const schema = localReference(document, media.schema);
  if (!schema) return undefined;
  try { return sample(schema, { skipReadOnly: true }, document); } catch { return schema.example ?? schema.default; }
}

function importedBody(document: any, operation: any, parameters: any[]): Pick<ApiClientRequestInput, 'body' | 'bodyMode' | 'formFields'> {
  if (document.swagger === '2.0') {
    const bodyParameter = parameters.find((parameter) => localReference(document, parameter)?.in === 'body');
    if (bodyParameter) {
      const resolved = localReference(document, bodyParameter);
      const value = bodyExample({ schema: resolved.schema, example: resolved['x-example'] }, document);
      const contentType = operation.consumes?.[0] ?? document.consumes?.[0] ?? 'application/json';
      return serializeImportedBody(contentType, value, []);
    }
    const formParameters = parameters.map((parameter) => localReference(document, parameter)).filter((parameter) => parameter?.in === 'formData');
    if (formParameters.length) {
      const contentType = operation.consumes?.[0] ?? document.consumes?.[0] ?? 'application/x-www-form-urlencoded';
      return serializeImportedBody(contentType, undefined, formParameters.map((parameter) => ({
        id: uuid(), name: text(parameter.name), value: parameterValue(parameter, document), enabled: true,
      })));
    }
    return { body: '', bodyMode: 'none', formFields: [] };
  }

  const content = operation.requestBody ? localReference(document, operation.requestBody)?.content : null;
  if (!content || typeof content !== 'object') return { body: '', bodyMode: 'none', formFields: [] };
  const priority = ['application/json', 'application/*+json', 'multipart/form-data', 'application/x-www-form-urlencoded', 'application/xml', 'text/xml', 'text/plain'];
  const contentType = priority.find((candidate) => candidate in content) ?? Object.keys(content)[0];
  const media = content[contentType];
  const schema = localReference(document, media?.schema);
  const fields = contentType === 'multipart/form-data' || contentType === 'application/x-www-form-urlencoded'
    ? Object.entries(schema?.properties ?? {}).map(([name, fieldSchema]) => ({
        id: uuid(), name, value: parameterValue({ schema: fieldSchema }, document), enabled: true,
      }))
    : [];
  return serializeImportedBody(contentType, bodyExample(media, document), fields);
}

function serializeImportedBody(contentType: string, value: unknown, formFields: ApiClientRequestInput['formFields']): Pick<ApiClientRequestInput, 'body' | 'bodyMode' | 'formFields'> {
  if (/multipart\/form-data/i.test(contentType)) return { body: '', bodyMode: 'multipart', formFields };
  if (/x-www-form-urlencoded/i.test(contentType)) {
    return {
      body: formFields.map((field) => `${encodeURIComponent(field.name)}=${encodeURIComponent(field.value)}`).join('&'),
      bodyMode: 'form',
      formFields,
    };
  }
  if (/json/i.test(contentType)) return { body: value === undefined ? '' : JSON.stringify(value, null, 2), bodyMode: 'json', formFields: [] };
  if (/xml/i.test(contentType)) return { body: text(value), bodyMode: 'xml', formFields: [] };
  return { body: text(value), bodyMode: value === undefined ? 'none' : 'text', formFields: [] };
}

function successStatus(operation: any): string {
  const status = Object.keys(operation.responses ?? {}).find((candidate) => /^2\d\d$/.test(candidate));
  return status ?? '';
}

function warning(warnings: Map<string, number>, code: string, count = 1): void {
  warnings.set(code, (warnings.get(code) ?? 0) + count);
}

export function importOpenApiDocument(document: any): OpenApiImportResult {
  if (!document || (document.swagger !== '2.0' && typeof document.openapi !== 'string')) throw new Error('The selected file is not a Swagger 2.0 or OpenAPI 3.x document.');
  const requests: ApiClientRequestInput[] = [];
  const folders: ApiClientFolder[] = [];
  const folderIds = new Map<string, string>();
  const variables: Record<string, string> = {};
  const warnings = new Map<string, number>();
  const globalServer = document.swagger === '2.0' ? swaggerBaseUrl(document) : serverUrl(document.servers?.[0]);
  if (globalServer) variables.baseUrl = globalServer;
  if (Array.isArray(document.servers) && document.servers.length > 1) warning(warnings, 'multiple_servers', document.servers.length - 1);
  if (document.webhooks && Object.keys(document.webhooks).length) warning(warnings, 'webhooks_ignored', Object.keys(document.webhooks).length);

  for (const [path, rawPathItem] of Object.entries(document.paths ?? {})) {
    const pathItem = localReference(document, rawPathItem);
    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];
      if (!operation) continue;
      const allParameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
      const resolvedParameters = allParameters.map((parameter) => localReference(document, parameter));
      const tag = text(operation.tags?.[0]);
      let folderId: string | null = null;
      if (tag) {
        if (!folderIds.has(tag)) {
          const id = uuid();
          folderIds.set(tag, id);
          folders.push({ id, name: tag, parentId: null, sequence: folders.length, sourceData: null });
        }
        folderId = folderIds.get(tag) ?? null;
      }
      const operationServer = document.swagger === '2.0' ? '' : serverUrl(operation.servers?.[0] ?? pathItem.servers?.[0]);
      const prefix = operationServer || globalServer ? '{{baseUrl}}' : '';
      if (operationServer && operationServer !== globalServer) {
        const key = `baseUrl_${requests.length + 1}`;
        variables[key] = operationServer;
      }
      const pathVariables = Object.fromEntries(resolvedParameters
        .filter((parameter) => parameter?.in === 'path' && parameter?.name)
        .map((parameter) => [String(parameter.name), parameterValue(parameter, document)]));
      Object.assign(variables, pathVariables);
      const query = resolvedParameters.filter((parameter) => parameter?.in === 'query').map((parameter) => ({
        id: uuid(), name: text(parameter.name), value: parameterValue(parameter, document), enabled: !parameter.deprecated,
      }));
      const headers = resolvedParameters.filter((parameter) => parameter?.in === 'header').map((parameter) => ({
        id: uuid(), name: text(parameter.name), value: parameterValue(parameter, document), enabled: !parameter.deprecated,
      }));
      const cookies = resolvedParameters.filter((parameter) => parameter?.in === 'cookie').length;
      if (cookies) warning(warnings, 'cookie_parameters_ignored', cookies);
      const selectedSecurity = operation.security ?? document.security;
      if (Array.isArray(selectedSecurity) && selectedSecurity.length > 1) warning(warnings, 'security_alternatives_simplified', selectedSecurity.length - 1);
      const scheme = securityScheme(document, operation)?.scheme;
      if (scheme?.type === 'oauth2' || scheme?.type === 'openIdConnect') warning(warnings, 'oauth_simplified');
      if (operation.callbacks && Object.keys(operation.callbacks).length) warning(warnings, 'callbacks_ignored', Object.keys(operation.callbacks).length);
      const imported = importedBody(document, operation, resolvedParameters);
      const status = successStatus(operation);
      const pathItemMetadata = clone(pathItem);
      for (const candidate of HTTP_METHODS) delete pathItemMetadata[candidate];
      const effectivePrefix = operationServer && operationServer !== globalServer ? `{{baseUrl_${requests.length + 1}}}` : prefix;
      requests.push(apiClientRequestSchema.parse({
        id: uuid(),
        name: text(operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`),
        method: method.toUpperCase() as ApiClientRequestInput['method'],
        url: `${effectivePrefix}${path.replace(/\{([^{}]+)\}/g, '{{$1}}')}`,
        folder: tag,
        folderId,
        sequence: requests.length,
        params: query,
        headers,
        auth: importedAuth(document, operation),
        ...imported,
        preRequestScript: text(operation['x-orkestrai-pre-request'] ?? operation['x-pre-request-script']),
        postResponseScript: text(operation['x-orkestrai-post-response'] ?? operation['x-post-response-script']),
        assertions: status ? [{ id: uuid(), source: 'status', property: '', operator: 'equals', expected: status, enabled: true }] : [],
        documentation: [operation.summary, operation.description].filter(Boolean).join('\n\n'),
        timeoutMs: Number(operation['x-timeout-ms']) || 30_000,
        followRedirects: operation['x-follow-redirects'] !== false,
        sourcePath: null,
        sourceData: { kind: 'openapi', data: { path, method, operation: clone(operation), pathItem: pathItemMetadata } },
      }));
    }
  }
  if (!requests.length) throw new Error('No supported HTTP operations were found in this API document.');
  return {
    name: text(document.info?.title) || 'Imported API',
    requests,
    folders,
    variables,
    warnings: [...warnings].map(([code, count]) => ({ code, ...(count > 1 ? { count } : {}) })),
  };
}
