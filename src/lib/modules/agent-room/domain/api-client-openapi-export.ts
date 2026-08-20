import type { ApiClientRequestInput } from '../contracts/schemas/apiClient.schema.js';
import type { ApiClientNodePayload } from './types.js';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return String(value);
}

function inferSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', items: value.length ? inferSchema(value[0]) : {} };
  if (typeof value === 'object') {
    const properties = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, inferSchema(child)]));
    return { type: 'object', properties };
  }
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}

function requestPath(url: string): string {
  let value = url.replace(/^{{\s*baseUrl(?:_\d+)?\s*}}/, '');
  try { value = new URL(value).pathname; } catch { /* Relative collection URLs are expected. */ }
  value = value.split('?')[0].split('#')[0] || '/';
  if (!value.startsWith('/')) value = `/${value}`;
  return value.replace(/{{\s*([^{}]+?)\s*}}/g, '{$1}');
}

function exportedParameters(request: ApiClientRequestInput, path: string, variables: Record<string, string>): any[] {
  const parameters: any[] = [];
  for (const name of [...path.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1])) {
    parameters.push({ name, in: 'path', required: true, schema: { type: 'string', ...(variables[name] ? { example: variables[name] } : {}) } });
  }
  for (const parameter of request.params ?? []) {
    if (!parameter.name) continue;
    parameters.push({ name: parameter.name, in: 'query', required: false, deprecated: !parameter.enabled, schema: { type: 'string', ...(parameter.value ? { example: parameter.value } : {}) } });
  }
  for (const header of request.headers) {
    if (!header.name || /^content-type$/i.test(header.name)) continue;
    parameters.push({ name: header.name, in: 'header', required: false, deprecated: !header.enabled, schema: { type: 'string', ...(header.value ? { example: header.value } : {}) } });
  }
  return parameters;
}

function exportedBody(request: ApiClientRequestInput): any {
  if (request.bodyMode === 'none') return undefined;
  if (request.bodyMode === 'form' || request.bodyMode === 'multipart') {
    const properties = Object.fromEntries((request.formFields ?? []).map((field) => [field.name, { type: 'string', ...(field.value ? { example: field.value } : {}) }]));
    const type = request.bodyMode === 'form' ? 'application/x-www-form-urlencoded' : 'multipart/form-data';
    return { content: { [type]: { schema: { type: 'object', properties } } } };
  }
  const contentType = request.bodyMode === 'json' ? 'application/json' : request.bodyMode === 'xml' ? 'application/xml' : 'text/plain';
  let example: unknown = request.body;
  if (request.bodyMode === 'json') {
    try { example = JSON.parse(request.body); } catch { /* Preserve invalid JSON as a string example. */ }
  }
  return { content: { [contentType]: { schema: inferSchema(example), example } } };
}

function authExport(request: ApiClientRequestInput, document: any): any[] | undefined {
  if (request.auth.type === 'none') return undefined;
  document.components ??= {};
  document.components.securitySchemes ??= {};
  if (request.auth.type === 'bearer') {
    document.components.securitySchemes.bearerAuth = { type: 'http', scheme: 'bearer' };
    return [{ bearerAuth: [] }];
  }
  if (request.auth.type === 'basic') {
    document.components.securitySchemes.basicAuth = { type: 'http', scheme: 'basic' };
    return [{ basicAuth: [] }];
  }
  const name = request.auth.key?.replace(/[^a-zA-Z0-9_.-]/g, '') || 'apiKey';
  const schemeName = `${name}Auth`;
  document.components.securitySchemes[schemeName] = { type: 'apiKey', name: request.auth.key || 'X-API-Key', in: request.auth.placement === 'query' ? 'query' : 'header' };
  return [{ [schemeName]: [] }];
}

export function exportOpenApiDocument(name: string, payload: ApiClientNodePayload): Record<string, unknown> {
  const source = payload.sourceKind === 'openapi' && payload.sourceCollection ? clone(payload.sourceCollection) as any : {};
  const fromSwagger = source.swagger === '2.0';
  const document: any = fromSwagger ? {
    info: clone(source.info ?? {}),
    components: { schemas: clone(source.definitions ?? {}), securitySchemes: {} },
    tags: clone(source.tags ?? []),
    externalDocs: clone(source.externalDocs),
  } : source;
  delete document.swagger;
  delete document.host;
  delete document.basePath;
  delete document.schemes;
  delete document.securityDefinitions;
  delete document.definitions;
  document.openapi = '3.1.0';
  document.info = { ...(document.info ?? {}), title: name, version: text(document.info?.version) || '1.0.0' };
  const baseUrl = payload.variables?.baseUrl;
  document.servers = baseUrl ? [{ url: baseUrl }] : Array.isArray(document.servers) ? document.servers : [];
  document.paths = {};
  for (const request of payload.requests ?? []) {
    const path = requestPath(request.url);
    const sourceData = request.sourceData?.kind === 'openapi' ? request.sourceData.data as any : {};
    const original = clone(sourceData.operation ?? {});
    const status = request.assertions?.find((assertion) => assertion.enabled && assertion.source === 'status' && assertion.operator === 'equals' && /^\d{3}$/.test(assertion.expected))?.expected ?? '200';
    const operation: any = {
      ...original,
      summary: request.name,
      description: request.documentation || original.description,
      operationId: original.operationId || request.id.replace(/[^a-zA-Z0-9_]/g, '_'),
      tags: request.folder ? [request.folder.split(/\s*\/\s*/)[0]] : original.tags,
      parameters: exportedParameters(request as ApiClientRequestInput, path, payload.variables ?? {}),
      responses: original.responses && Object.keys(original.responses).length ? original.responses : { [status]: { description: 'Successful response' } },
      'x-timeout-ms': request.timeoutMs ?? 30_000,
      'x-follow-redirects': request.followRedirects !== false,
    };
    const requestBody = exportedBody(request as ApiClientRequestInput);
    if (requestBody) operation.requestBody = requestBody;
    else delete operation.requestBody;
    const security = authExport(request as ApiClientRequestInput, document);
    if (security) operation.security = security;
    else delete operation.security;
    if (request.preRequestScript) operation['x-orkestrai-pre-request'] = request.preRequestScript;
    else delete operation['x-orkestrai-pre-request'];
    if (request.postResponseScript) operation['x-orkestrai-post-response'] = request.postResponseScript;
    else delete operation['x-orkestrai-post-response'];
    const pathMetadata = clone(sourceData.pathItem ?? {});
    document.paths[path] = { ...(document.paths[path] ?? pathMetadata), [request.method.toLowerCase()]: operation };
  }
  if (!Object.keys(document.components?.schemas ?? {}).length && !Object.keys(document.components?.securitySchemes ?? {}).length) delete document.components;
  if (!document.externalDocs) delete document.externalDocs;
  return document;
}
