import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uuidv7 } from '@beeblock/svelar/support';
import { bundle, validate } from '@readme/openapi-parser';
import { parseCollection, parseEnvironment, parseFolder, parseRequest, stringifyCollection, stringifyEnvironment, stringifyFolder, stringifyRequest } from '@usebruno/filestore';
import { apiClientAuthSchema, apiClientNativeCollectionSchema, apiClientNetworkSchema, apiClientRequestSchema, persistedApiClientRequestSchema, type ApiClientRequestInput } from '../../contracts/schemas/apiClient.schema.js';
import { ExecuteApiClientRequestDto, type ExportApiClientCollectionDto, type ImportApiClientCollectionDto } from '../dto/ApiClientDtos.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { runApiClientScript, type ApiClientScriptResponse, type ApiClientScriptStage } from '../../infrastructure/api-client/ApiClientScriptSandbox.js';
import { executeHttpTransport } from '../../infrastructure/api-client/ApiClientHttpTransport.js';
import { executeGrpcTransport, executeWebSocketTransport, type ApiClientTransportMessage } from '../../infrastructure/api-client/ApiClientTransports.js';
import { apiClientManagedSourceFiles, apiClientPayloadFingerprint, apiClientSourceFingerprint, apiClientSourceRoot } from '../../infrastructure/api-client/ApiClientSyncFiles.js';
import type { ApiClientFolder, ApiClientNodePayload } from '../../domain/types.js';
import { importOpenApiDocument } from '../../domain/api-client-openapi.js';

const IMPORT_LIMIT = 500;
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

type ImportedCollection = {
  name: string;
  requests: ApiClientRequestInput[];
  folders: ApiClientFolder[];
  variables: Record<string, string>;
  environments: Record<string, Record<string, string>>;
  collectionPreRequestScript: string;
  collectionPostResponseScript: string;
  sourceCollection: Record<string, unknown> | null;
  compatibilityWarnings: Array<{ code: string; count?: number }>;
  nativePayload?: ApiClientNodePayload;
};

type ApiClientTestResult = {
  id: string;
  label: string;
  passed: boolean;
  actual: string;
  expected: string;
};

export type ApiClientExecutionResult = ApiClientScriptResponse & {
  variables: Record<string, string>;
  scriptLogs: string[];
  tests: ApiClientTestResult[];
  protocol?: 'websocket' | 'grpc';
  messages?: ApiClientTransportMessage[];
  cookies?: NonNullable<ApiClientNodePayload['network']>['cookies'];
};

function renderVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/{{\s*([^{}]+?)\s*}}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match
  );
}

function keyValueFields(value: unknown): ApiClientRequestInput['headers'] {
  if (!Array.isArray(value)) return [];
  return value.map((field: any) => ({
    id: String(field.id || uuidv7()),
    name: String(field.name ?? field.key ?? ''),
    value: String(field.value ?? ''),
    enabled: field.enabled !== false && field.disabled !== true,
  }));
}

function requestDefaults(request: Partial<ApiClientRequestInput> & Pick<ApiClientRequestInput, 'id' | 'name' | 'method' | 'url' | 'headers' | 'auth' | 'body' | 'bodyMode'>): ApiClientRequestInput {
  return apiClientRequestSchema.parse({
    folder: '',
    sequence: 0,
    params: [],
    formFields: [],
    preRequestScript: '',
    postResponseScript: '',
    assertions: [],
    documentation: '',
    timeoutMs: 30_000,
    followRedirects: true,
    ...request,
  });
}

function responseValue(response: ApiClientScriptResponse, source: ApiClientRequestInput['assertions'][number]['source'], property: string): unknown {
  if (source === 'status') return response.status;
  if (source === 'responseTime') return response.durationMs;
  if (source === 'header') return response.headers[property.toLowerCase()];
  let value: unknown = response.body;
  try { value = JSON.parse(response.body); } catch { /* Plain text body. */ }
  const normalized = property.trim().replace(/^body\.?/, '');
  if (!normalized) return value;
  for (const segment of normalized.split('.').filter(Boolean)) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function testAssertions(request: ApiClientRequestInput, response: ApiClientScriptResponse): ApiClientTestResult[] {
  return request.assertions.filter((assertion) => assertion.enabled).map((assertion) => {
    const actualValue = responseValue(response, assertion.source, assertion.property);
    const serialized = typeof actualValue === 'string' ? actualValue : JSON.stringify(actualValue);
    const actual = typeof serialized === 'string' ? serialized : '';
    const expected = assertion.expected;
    let passed = false;
    if (assertion.operator === 'exists') passed = actualValue !== undefined && actualValue !== null;
    else if (assertion.operator === 'equals') passed = actual === expected;
    else if (assertion.operator === 'notEquals') passed = actual !== expected;
    else if (assertion.operator === 'contains') passed = actual.includes(expected);
    else if (assertion.operator === 'matches') {
      try { passed = new RegExp(expected).test(actual); } catch { passed = false; }
    } else {
      const left = Number(actualValue);
      const right = Number(expected);
      if (Number.isFinite(left) && Number.isFinite(right)) {
        if (assertion.operator === 'lt') passed = left < right;
        if (assertion.operator === 'lte') passed = left <= right;
        if (assertion.operator === 'gt') passed = left > right;
        if (assertion.operator === 'gte') passed = left >= right;
      }
    }
    return {
      id: assertion.id,
      label: `${assertion.source}${assertion.property ? `.${assertion.property}` : ''} ${assertion.operator}`,
      passed,
      actual: actual ?? '',
      expected,
    };
  });
}

function httpMethod(value: unknown): ApiClientRequestInput['method'] {
  const method = String(value ?? 'GET').toUpperCase();
  return HTTP_METHODS.has(method) ? method as ApiClientRequestInput['method'] : 'GET';
}

function safeInventoryUrl(value: string): string {
  return value
    .replace(/\/\/[^/@\s]+@/g, '//***@')
    .replace(/([?&](?:api[_-]?key|access[_-]?token|token|secret|password|authorization)=)[^&#]*/gi, '$1***');
}

function encodeFormPart(value: unknown): string {
  return encodeURIComponent(String(value ?? '')).replace(/%7B%7B(.+?)%7D%7D/gi, '{{$1}}');
}

function requestBody(parsed: any): { body: string; bodyMode: ApiClientRequestInput['bodyMode'] } {
  const mode = String(parsed?.request?.body?.mode ?? 'none');
  if (mode === 'json') return { body: String(parsed.request.body.json ?? ''), bodyMode: 'json' };
  if (mode === 'xml') return { body: String(parsed.request.body.xml ?? ''), bodyMode: 'xml' };
  if (mode === 'text') return { body: String(parsed.request.body.text ?? ''), bodyMode: 'text' };
  if (mode === 'formUrlEncoded') {
    const form = Array.isArray(parsed.request.body.formUrlEncoded) ? parsed.request.body.formUrlEncoded : [];
    return {
      body: form.filter((field: any) => field.enabled !== false).map((field: any) => `${encodeFormPart(field.name)}=${encodeFormPart(field.value)}`).join('&'),
      bodyMode: 'form',
    };
  }
  if (mode === 'multipartForm') return { body: '', bodyMode: 'multipart' };
  return { body: '', bodyMode: 'none' };
}

function scriptFromEvents(events: unknown, listen: 'prerequest' | 'test'): string {
  return (Array.isArray(events) ? events : [])
    .filter((event: any) => event?.listen === listen)
    .flatMap((event: any) => Array.isArray(event?.script?.exec) ? event.script.exec : typeof event?.script?.exec === 'string' ? [event.script.exec] : [])
    .join('\n');
}

function variableRecord(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    return Object.fromEntries(value
      .filter((entry: any) => entry?.enabled !== false && (entry?.name || entry?.key))
      .map((entry: any) => [String(entry.name ?? entry.key), String(entry.value ?? '')]));
  }
  return {};
}

function brunoAuth(request: any): ApiClientRequestInput['auth'] {
  const mode = String(request?.auth?.mode ?? 'none');
  if (mode === 'bearer') return apiClientAuthSchema.parse({ type: 'bearer', token: String(request.auth.bearer?.token ?? '') });
  if (mode === 'basic') return apiClientAuthSchema.parse({ type: 'basic', username: String(request.auth.basic?.username ?? ''), password: String(request.auth.basic?.password ?? '') });
  if (mode === 'apikey') return apiClientAuthSchema.parse({ type: 'apiKey', key: String(request.auth.apikey?.key ?? ''), value: String(request.auth.apikey?.value ?? ''), placement: request.auth.apikey?.placement === 'queryparams' ? 'query' : 'header' });
  if (mode === 'oauth2') return apiClientAuthSchema.parse({ type: 'oauth2', oauth2: request.auth.oauth2 ?? {} });
  return apiClientAuthSchema.parse({ type: 'none' });
}

function importedMessages(value: unknown): ApiClientRequestInput['websocket']['messages'] {
  if (!Array.isArray(value)) return [];
  return value.map((message: any, index) => ({
    id: String(message.id || message.uid || uuidv7()),
    name: String(message.name ?? `Message ${index + 1}`),
    content: String(message.content ?? message.data ?? ''),
    type: ['json', 'binary'].includes(String(message.type)) ? message.type : 'text',
    enabled: message.enabled !== false && message.selected !== false,
  }));
}

function postmanAuth(auth: any): ApiClientRequestInput['auth'] {
  const values = (kind: string) => Object.fromEntries(
    (Array.isArray(auth?.[kind]) ? auth[kind] : []).filter((entry: any) => entry?.key).map((entry: any) => [String(entry.key), String(entry.value ?? '')])
  );
  if (auth?.type === 'bearer') return apiClientAuthSchema.parse({ type: 'bearer', token: values('bearer').token ?? '' });
  if (auth?.type === 'basic') {
    const basic = values('basic');
    return apiClientAuthSchema.parse({ type: 'basic', username: basic.username ?? '', password: basic.password ?? '' });
  }
  if (auth?.type === 'apikey') {
    const apiKey = values('apikey');
    return apiClientAuthSchema.parse({ type: 'apiKey', key: apiKey.key ?? '', value: apiKey.value ?? '', placement: apiKey.in === 'query' ? 'query' : 'header' });
  }
  if (auth?.type === 'oauth2') return apiClientAuthSchema.parse({ type: 'oauth2', oauth2: values('oauth2') });
  return apiClientAuthSchema.parse({ type: 'none' });
}

function fromBruno(parsed: any, sourcePath: string): ApiClientRequestInput | null {
  const request = parsed?.request;
  if (!request?.url) return null;
  const protocol = parsed.type === 'graphql-request'
    ? 'graphql'
    : parsed.type === 'ws-request'
      ? 'websocket'
      : parsed.type === 'grpc-request'
        ? 'grpc'
        : 'http';
  const body = requestBody(parsed);
  return requestDefaults({
    id: uuidv7(),
    name: String(parsed.name || basename(sourcePath, extname(sourcePath))),
    method: protocol === 'websocket' ? 'GET' : protocol === 'grpc' ? 'POST' : httpMethod(request.method || 'POST'),
    protocol,
    url: String(request.url),
    folder: '',
    sequence: Math.max(0, Number(parsed.seq ?? 1) - 1),
    params: keyValueFields(request.params),
    headers: Array.isArray(request.headers)
      ? request.headers.map((header: any) => ({ id: uuidv7(), name: String(header.name ?? ''), value: String(header.value ?? ''), enabled: header.enabled !== false }))
      : [],
    auth: brunoAuth(request),
    ...body,
    formFields: keyValueFields(request.body?.formUrlEncoded ?? request.body?.multipartForm),
    preRequestScript: String(request.script?.req ?? parsed.script?.req ?? parsed.scripts?.preRequest ?? ''),
    postResponseScript: String(request.script?.res ?? parsed.script?.res ?? parsed.scripts?.postResponse ?? ''),
    assertions: [],
    documentation: String(request.docs ?? parsed.docs ?? ''),
    timeoutMs: 30_000,
    followRedirects: true,
    graphql: {
      query: String(request.body?.graphql?.query ?? ''),
      variables: String(request.body?.graphql?.variables ?? '{}'),
      operationName: String(request.body?.graphql?.operationName ?? ''),
    },
    websocket: {
      messages: importedMessages(request.body?.ws),
      protocols: String((request.headers ?? []).find((header: any) => /^sec-websocket-protocol$/i.test(header?.name))?.value ?? '').split(',').map((value) => value.trim()).filter(Boolean),
      autoReconnect: Boolean(parsed.settings?.autoReconnect),
      reconnectAttempts: Number(parsed.settings?.reconnectAttempts ?? 3),
      keepAliveIntervalMs: Number(parsed.settings?.keepAliveInterval ?? 0),
    },
    grpc: {
      protoPath: request.protoPath ? resolve(dirname(sourcePath), String(request.protoPath)) : '',
      service: String(request.method ?? '').replace(/^\//, '').split('/')[0] ?? '',
      method: String(request.method ?? '').replace(/^\//, '').split('/')[1] ?? '',
      methodType: request.methodType === 'server-streaming' ? 'serverStreaming'
        : request.methodType === 'client-streaming' ? 'clientStreaming'
          : request.methodType === 'bidi-streaming' ? 'bidirectional' : 'unary',
      messages: importedMessages(request.body?.grpc),
      useTls: /^grpcs:\/\//i.test(String(request.url)),
    },
    sourcePath,
    sourceData: { kind: 'bruno', data: structuredClone(parsed) },
  });
}

function postmanUrl(url: unknown): string {
  if (typeof url === 'string') return url;
  const structured = url as { raw?: unknown; query?: unknown } | null;
  const raw = String(structured?.raw ?? '');
  if (!Array.isArray(structured?.query)) return raw;
  const queryIndex = raw.indexOf('?');
  if (queryIndex < 0) return raw;
  const fragmentIndex = raw.indexOf('#', queryIndex);
  return `${raw.slice(0, queryIndex)}${fragmentIndex >= 0 ? raw.slice(fragmentIndex) : ''}`;
}

function fromPostmanItem(item: any, lineage: string[] = [], inheritedAuth: any = null): ApiClientRequestInput[] {
  if (Array.isArray(item?.item)) {
    return item.item.flatMap((child: any) => fromPostmanItem(child, [...lineage, String(item.name ?? '')].filter(Boolean), item.auth ?? inheritedAuth));
  }
  if (!item?.request) return [];
  const rawBody = item.request.body?.raw;
  const protocol = item.request.body?.mode === 'graphql' ? 'graphql' : 'http';
  const bodyMode = item.request.body?.mode === 'raw'
    ? (/json/i.test(String(item.request.body?.options?.raw?.language ?? '')) ? 'json' : 'text')
    : item.request.body?.mode === 'urlencoded' ? 'form'
      : item.request.body?.mode === 'formdata' ? 'multipart'
        : 'none';
  const body = bodyMode === 'form'
    ? (Array.isArray(item.request.body?.urlencoded) ? item.request.body.urlencoded : [])
      .filter((field: any) => !field.disabled)
      .map((field: any) => `${encodeFormPart(field.key)}=${encodeFormPart(field.value)}`)
      .join('&')
    : typeof rawBody === 'string' ? rawBody : '';
  return [requestDefaults({
    id: String(item.id || uuidv7()),
    name: String(item.name || 'Request'),
    folder: lineage.join(' / '),
    sequence: 0,
    method: httpMethod(item.request.method),
    protocol,
    url: postmanUrl(item.request.url),
    params: keyValueFields(item.request.url?.query),
    headers: Array.isArray(item.request.header)
      ? item.request.header.map((header: any) => ({ id: uuidv7(), name: String(header.key ?? ''), value: String(header.value ?? ''), enabled: !header.disabled }))
      : [],
    auth: postmanAuth(item.request.auth?.type === 'noauth' ? null : (item.request.auth ?? inheritedAuth)),
    body,
    bodyMode,
    formFields: keyValueFields(item.request.body?.urlencoded ?? item.request.body?.formdata),
    preRequestScript: scriptFromEvents(item.event, 'prerequest'),
    postResponseScript: scriptFromEvents(item.event, 'test'),
    assertions: [],
    documentation: String(item.request.description ?? ''),
    timeoutMs: 30_000,
    followRedirects: true,
    graphql: {
      query: String(item.request.body?.graphql?.query ?? ''),
      variables: typeof item.request.body?.graphql?.variables === 'string'
        ? item.request.body.graphql.variables
        : JSON.stringify(item.request.body?.graphql?.variables ?? {}, null, 2),
      operationName: String(item.request.body?.graphql?.operationName ?? ''),
    },
    sourcePath: null,
    sourceData: { kind: 'postman', data: structuredClone(item) },
  })];
}

function postmanFolders(items: unknown): { folders: ApiClientFolder[]; idsByPath: Map<string, string> } {
  const folders: ApiClientFolder[] = [];
  const idsByPath = new Map<string, string>();
  const visit = (children: unknown, parentId: string | null, lineage: string[]) => {
    if (!Array.isArray(children)) return;
    for (const child of children) {
      if (!Array.isArray(child?.item)) continue;
      const name = String(child.name ?? 'Folder');
      const path = [...lineage, name].join(' / ');
      const id = uuidv7();
      const { item: _items, ...metadata } = structuredClone(child);
      folders.push({
        id,
        name,
        parentId,
        sequence: folders.filter((folder) => folder.parentId === parentId).length,
        sourceData: { kind: 'postman', data: metadata },
      });
      idsByPath.set(path, id);
      visit(child.item, id, [...lineage, name]);
    }
  };
  visit(items, null, []);
  return { folders, idsByPath };
}

async function brunoFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  const visit = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      if (entry.isDirectory() && entry.name === 'environments') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(?:bru|ya?ml)$/i.test(entry.name) && !/^(?:opencollection|collection|folder)\.(?:bru|ya?ml)$/i.test(entry.name)) output.push(path);
      if (output.length >= IMPORT_LIMIT) return;
    }
  };
  await visit(root);
  return output;
}

async function brunoFolders(root: string, files: string[]): Promise<{ folders: ApiClientFolder[]; foldersByDirectory: Map<string, ApiClientFolder> }> {
  const folders: ApiClientFolder[] = [];
  const foldersByDirectory = new Map<string, ApiClientFolder>();
  const directories = new Set<string>();
  for (const file of files) {
    const relativeDirectory = dirname(relative(root, file));
    if (relativeDirectory === '.') continue;
    const segments = relativeDirectory.split(/[/\\]+/).filter(Boolean);
    for (let index = 1; index <= segments.length; index += 1) directories.add(segments.slice(0, index).join('/'));
  }
  for (const relativeDirectory of [...directories].sort((left, right) => left.split('/').length - right.split('/').length || left.localeCompare(right))) {
    const segments = relativeDirectory.split('/');
    const parentDirectory = segments.slice(0, -1).join('/');
    const parent = parentDirectory ? foldersByDirectory.get(parentDirectory) : null;
    let parsed: any = null;
    for (const filename of ['folder.bru', 'folder.yml', 'folder.yaml']) {
      const candidate = join(root, ...segments, filename);
      if (!await pathExists(candidate)) continue;
      try {
        parsed = parseFolder(await readLimited(candidate, 2 * 1024 * 1024), { format: /\.bru$/i.test(filename) ? 'bru' : 'yml' });
        break;
      } catch { /* Keep the directory usable when folder metadata is invalid. */ }
    }
    const folder: ApiClientFolder = {
      id: uuidv7(),
      name: String(parsed?.meta?.name ?? segments.at(-1) ?? 'Folder'),
      parentId: parent?.id ?? null,
      sequence: Number.isFinite(Number(parsed?.meta?.seq)) ? Math.max(0, Number(parsed.meta.seq) - 1) : folders.filter((entry) => entry.parentId === (parent?.id ?? null)).length,
      sourceData: parsed ? { kind: 'bruno', data: structuredClone(parsed) } : null,
    };
    folders.push(folder);
    foldersByDirectory.set(relativeDirectory, folder);
  }
  return { folders, foldersByDirectory };
}

async function readLimited(path: string, limit = 10 * 1024 * 1024): Promise<string> {
  const info = await stat(path);
  if (!info.isFile() || info.size > limit) throw new Error('Collection file is invalid or exceeds 10 MB.');
  return readFile(path, 'utf8');
}

async function pathExists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

function safePathSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  return (normalized || fallback).slice(0, 120);
}

function folderSegments(folders: ApiClientFolder[], folderId: string | null | undefined): string[] {
  const output: string[] = [];
  const visited = new Set<string>();
  let current = folders.find((folder) => folder.id === folderId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    output.unshift(safePathSegment(current.name, 'Folder'));
    current = folders.find((folder) => folder.id === current?.parentId);
  }
  return output;
}

function requestFolderSegments(folders: ApiClientFolder[], request: ApiClientRequestInput): string[] {
  const normalized = folderSegments(folders, request.folderId);
  if (normalized.length) return normalized;
  if (!request.folder.trim()) return [];
  return request.folder.split(/\s*\/\s*/).map((part) => safePathSegment(part, 'Folder')).filter(Boolean);
}

function toBrunoAuth(request: ApiClientRequestInput, original: any): any {
  if (request.auth.type === 'bearer') return { mode: 'bearer', bearer: { token: request.auth.token } };
  if (request.auth.type === 'basic') return { mode: 'basic', basic: { username: request.auth.username, password: request.auth.password } };
  if (request.auth.type === 'apiKey') {
    return {
      mode: 'apikey',
      apikey: {
        key: request.auth.key ?? '',
        value: request.auth.value ?? '',
        placement: request.auth.placement === 'query' ? 'queryparams' : 'header',
      },
    };
  }
  const originalMode = String(original?.mode ?? 'none');
  return ['none', 'bearer', 'basic', 'apikey'].includes(originalMode) ? { mode: 'none' } : structuredClone(original);
}

function toBrunoBody(request: ApiClientRequestInput, original: any): any {
  if (request.protocol === 'graphql') {
    return { mode: 'graphql', graphql: { query: request.graphql.query, variables: request.graphql.variables } };
  }
  if (request.protocol === 'websocket') {
    return {
      mode: 'ws',
      ws: request.websocket.messages.map((message) => ({
        name: message.name,
        content: message.content,
        type: message.type,
        selected: message.enabled,
      })),
    };
  }
  if (request.protocol === 'grpc') {
    return {
      mode: 'grpc',
      grpc: request.grpc.messages.map((message) => ({ name: message.name, content: message.content })),
    };
  }
  if (request.bodyMode === 'json') return { mode: 'json', json: request.body };
  if (request.bodyMode === 'xml') return { mode: 'xml', xml: request.body };
  if (request.bodyMode === 'text') return { mode: 'text', text: request.body };
  if (request.bodyMode === 'form') {
    return {
      mode: 'formUrlEncoded',
      formUrlEncoded: request.formFields.map((field) => ({ name: field.name, value: field.value, enabled: field.enabled })),
    };
  }
  if (request.bodyMode === 'multipart') {
    const originalFields = Array.isArray(original?.multipartForm) ? original.multipartForm : [];
    return {
      mode: 'multipartForm',
      multipartForm: request.formFields.map((field) => {
        const previous = originalFields.find((candidate: any) => candidate?.name === field.name);
        return previous?.type === 'file'
          ? { ...previous, name: field.name, value: [field.value], enabled: field.enabled, type: 'file' }
          : { ...previous, name: field.name, value: field.value, enabled: field.enabled, type: 'text' };
      }),
    };
  }
  return { mode: 'none' };
}

function toBrunoRequest(request: ApiClientRequestInput, sequence: number): any {
  const original = request.sourceData?.kind === 'bruno' ? structuredClone(request.sourceData.data) as any : {};
  const originalRequest = original.request ?? {};
  const protocol = request.protocol ?? 'http';
  const type = protocol === 'graphql' ? 'graphql-request' : protocol === 'websocket' ? 'ws-request' : protocol === 'grpc' ? 'grpc-request' : 'http-request';
  const method = protocol === 'grpc' ? `${request.grpc.service}/${request.grpc.method}` : request.method;
  return {
    ...original,
    type,
    name: request.name,
    seq: sequence + 1,
    tags: Array.isArray(original.tags) ? original.tags : [],
    settings: {
      ...(original.settings ?? {}),
      timeout: request.timeoutMs,
      ...(protocol === 'websocket' ? { keepAliveInterval: request.websocket.keepAliveIntervalMs } : {}),
    },
    request: {
      ...originalRequest,
      method,
      url: request.url,
      ...(protocol === 'grpc' ? {
        methodType: request.grpc.methodType === 'serverStreaming' ? 'server-streaming'
          : request.grpc.methodType === 'clientStreaming' ? 'client-streaming'
            : request.grpc.methodType === 'bidirectional' ? 'bidi-streaming' : 'unary',
        protoPath: request.grpc.protoPath,
      } : {}),
      params: request.params.map((field) => ({ name: field.name, value: field.value, enabled: field.enabled })),
      headers: request.headers.map((field) => ({ name: field.name, value: field.value, enabled: field.enabled })),
      auth: toBrunoAuth(request, originalRequest.auth),
      body: toBrunoBody(request, originalRequest.body),
      script: {
        ...(originalRequest.script ?? {}),
        req: request.preRequestScript,
        res: request.postResponseScript,
      },
      docs: request.documentation,
    },
  };
}

async function availableCollectionDirectory(parent: string, name: string): Promise<string> {
  const base = safePathSegment(name, 'Orkestrai API');
  for (let suffix = 1; suffix <= 1000; suffix += 1) {
    const candidate = join(parent, suffix === 1 ? base : `${base}-${suffix}`);
    if (!await pathExists(candidate)) return candidate;
  }
  throw new Error('Could not allocate a destination directory for the Bruno collection.');
}

function filesystemPath(url: string): string {
  if (/^file:/i.test(url)) return fileURLToPath(url);
  return decodeURIComponent(url.replace(/^file:\/\//i, ''));
}

async function bundledOpenApi(path: string): Promise<Record<string, unknown>> {
  const entry = await realpath(path);
  const root = dirname(entry);
  const insideRoot = (candidate: string) => candidate === root || candidate.startsWith(`${root}${sep}`);
  const safeFileResolver = {
    order: 1,
    canRead: (file: { url: string }) => !/^https?:/i.test(file.url),
    read: async (file: { url: string }) => {
      const raw = filesystemPath(file.url);
      const candidate = await realpath(isAbsolute(raw) ? raw : resolve(root, raw));
      if (!insideRoot(candidate)) throw new Error('OpenAPI references must stay inside the selected document directory.');
      const info = await stat(candidate);
      if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('An OpenAPI reference is invalid or exceeds 10 MB.');
      return readFile(candidate);
    },
  };
  const noRemoteResolver = {
    order: 1,
    canRead: () => false,
    read: () => { throw new Error('Remote OpenAPI references are disabled.'); },
  };
  const document = await bundle(entry, {
    resolve: { external: true, file: safeFileResolver, http: noRemoteResolver },
    timeoutMs: 10_000,
  } as any) as Record<string, unknown>;
  const validation = await validate(document as any, { resolve: { external: false }, timeoutMs: 10_000 });
  if (!validation.valid) {
    const messages = validation.errors.slice(0, 4).map((error) => error.message).join(' ');
    throw new Error(`Invalid OpenAPI document. ${messages}`);
  }
  return document;
}

export class ApiClientService {
  async list(workspaceId: string, agentNodeId?: string | null) {
    const nodes = await workspaceRepository.listNodes(workspaceId);
    let accessibleIds: Set<string> | null = null;
    if (agentNodeId) {
      accessibleIds = new Set<string>();
      for (const edge of await workspaceRepository.listEdges(workspaceId)) {
        if (edge.sourceNodeId === agentNodeId) accessibleIds.add(edge.targetNodeId);
        if (edge.targetNodeId === agentNodeId) accessibleIds.add(edge.sourceNodeId);
      }
    }
    return nodes
      .filter((node) => node.type === 'apiClient' && (!accessibleIds || accessibleIds.has(node.id)))
      .map((node) => ({
        nodeId: node.id,
        title: node.title ?? 'API Client',
        requests: (((node.payload as { requests?: ApiClientRequestInput[] }).requests) ?? []).map((request) => ({
          requestId: request.id,
          name: request.name,
          method: request.method,
          url: safeInventoryUrl(request.url),
          authType: request.auth?.type ?? 'none',
        })),
      }));
  }

  async executeSaved(workspaceId: string, nodeId: string, requestId: string, variables: Record<string, string>, agentNodeId?: string | null) {
    if (agentNodeId) {
      const clients = await this.list(workspaceId, agentNodeId);
      if (!clients.some((client) => client.nodeId === nodeId)) throw new Error('API Client node is not connected to this agent.');
    }
    const node = await this.requireNode(workspaceId, nodeId);
    const request = ((node.payload as { requests?: ApiClientRequestInput[] }).requests ?? []).find((candidate) => candidate.id === requestId);
    if (!request) throw new Error('Saved API request not found.');
    return this.execute(workspaceId, new ExecuteApiClientRequestDto({
      nodeId,
      request: apiClientRequestSchema.parse({
        ...request,
        auth: request.auth ?? { type: 'none', token: '', username: '', password: '' },
      }),
      variables,
      timeoutMs: 30_000,
    }));
  }

  async execute(workspaceId: string, dto: ExecuteApiClientRequestDto): Promise<ApiClientExecutionResult> {
    const node = await this.requireNode(workspaceId, dto.input.nodeId);
    const payload = (node.payload ?? {}) as ApiClientNodePayload;
    const collectionPreRequestScript = dto.input.collectionPreRequestScript ?? payload.collectionPreRequestScript;
    const collectionPostResponseScript = dto.input.collectionPostResponseScript ?? payload.collectionPostResponseScript;
    // Round-trip metadata belongs to persistence/export and never enters the
    // script VM or the HTTP execution path.
    let request = requestDefaults({ ...dto.input.request, sourceData: null });
    let variables = { ...dto.input.variables };
    const scriptLogs: string[] = [];
    const scriptTests: ApiClientTestResult[] = [];
    const preRequestScripts: Array<{ script: string | undefined; stage: ApiClientScriptStage }> = [
      { script: collectionPreRequestScript, stage: 'collectionPreRequest' },
      { script: request.preRequestScript, stage: 'requestPreRequest' },
    ];
    for (const { script, stage } of preRequestScripts) {
      if (!script?.trim()) continue;
      const result = await runApiClientScript({ script, request, variables, stage });
      request = apiClientRequestSchema.parse(result.request);
      variables = result.variables;
      scriptLogs.push(...result.logs);
      scriptTests.push(...result.tests);
    }

    const finalize = async (result: ApiClientScriptResponse & { protocol?: 'websocket' | 'grpc'; messages?: ApiClientTransportMessage[]; cookies?: NonNullable<ApiClientNodePayload['network']>['cookies'] }): Promise<ApiClientExecutionResult> => {
      const postResponseScripts: Array<{ script: string | undefined; stage: ApiClientScriptStage }> = [
        { script: request.postResponseScript, stage: 'requestPostResponse' },
        { script: collectionPostResponseScript, stage: 'collectionPostResponse' },
      ];
      for (const { script, stage } of postResponseScripts) {
        if (!script?.trim()) continue;
        const scripted = await runApiClientScript({ script, request, variables, response: result, stage });
        request = apiClientRequestSchema.parse(scripted.request);
        variables = scripted.variables;
        scriptLogs.push(...scripted.logs);
        scriptTests.push(...scripted.tests);
      }
      const tests = [...scriptTests, ...testAssertions(request, result)];
      return { ...result, variables, scriptLogs, tests };
    };

    const protocol = request.protocol ?? 'http';
    const network = apiClientNetworkSchema.parse(payload.network ?? {});
    if (protocol === 'websocket' || protocol === 'grpc') {
      let renderedUrl = renderVariables(request.url, variables);
      if (protocol === 'websocket') {
        const url = new URL(renderedUrl);
        if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('WebSocket requests require a ws:// or wss:// URL.');
        if (request.auth.type === 'apiKey' && request.auth.placement === 'query' && request.auth.key?.trim()) {
          url.searchParams.append(request.auth.key.trim(), renderVariables(request.auth.value ?? '', variables));
        }
        renderedUrl = url.toString();
        return finalize(await executeWebSocketTransport({
          request,
          url: renderedUrl,
          variables,
          timeoutMs: request.timeoutMs || dto.input.timeoutMs,
          network,
        }));
      }
      const prepared = apiClientRequestSchema.parse({
        ...request,
        headers: request.headers.map((header) => ({ ...header, value: renderVariables(header.value, variables) })),
        grpc: {
          ...request.grpc,
          messages: request.grpc.messages.map((message) => ({ ...message, content: renderVariables(message.content, variables) })),
        },
      });
      return finalize(await executeGrpcTransport({
        request: prepared,
        url: renderedUrl,
        variables,
        timeoutMs: request.timeoutMs || dto.input.timeoutMs,
        network,
      }));
    }

    if (protocol === 'graphql') {
      let graphqlVariables: unknown = {};
      const rawVariables = renderVariables(request.graphql.variables || '{}', variables);
      try { graphqlVariables = rawVariables.trim() ? JSON.parse(rawVariables) : {}; }
      catch { throw new Error('GraphQL variables must be valid JSON.'); }
      request = apiClientRequestSchema.parse({
        ...request,
        bodyMode: request.method === 'GET' ? 'none' : 'json',
        body: request.method === 'GET' ? '' : JSON.stringify({
          query: renderVariables(request.graphql.query, variables),
          variables: graphqlVariables,
          ...(request.graphql.operationName ? { operationName: request.graphql.operationName } : {}),
        }),
      });
    }

    const url = new URL(renderVariables(request.url, variables));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS requests are allowed.');
    if (protocol === 'graphql' && request.method === 'GET') {
      url.searchParams.set('query', renderVariables(request.graphql.query, variables));
      if (request.graphql.variables.trim()) url.searchParams.set('variables', renderVariables(request.graphql.variables, variables));
      if (request.graphql.operationName) url.searchParams.set('operationName', request.graphql.operationName);
    }
    for (const param of request.params) {
      if (param.enabled && param.name.trim()) url.searchParams.append(param.name.trim(), renderVariables(param.value, variables));
    }
    const headers = new Headers();
    for (const header of request.headers) {
      if (header.enabled && header.name.trim()) headers.append(header.name.trim(), renderVariables(header.value, variables));
    }
    if (request.auth.type === 'bearer' && request.auth.token && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${renderVariables(request.auth.token, variables)}`);
    }
    if (request.auth.type === 'basic' && !headers.has('authorization')) {
      const username = renderVariables(request.auth.username, variables);
      const password = renderVariables(request.auth.password, variables);
      headers.set('authorization', `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
    }
    if (request.auth.type === 'apiKey' && request.auth.key?.trim()) {
      const key = request.auth.key.trim();
      const value = renderVariables(request.auth.value ?? '', variables);
      if (request.auth.placement === 'query') url.searchParams.append(key, value);
      else if (!headers.has(key)) headers.set(key, value);
    }
    if (request.auth.type === 'oauth2' && request.auth.oauth2.accessToken && !headers.has('authorization')) {
      headers.set('authorization', `${request.auth.oauth2.tokenType || 'Bearer'} ${renderVariables(request.auth.oauth2.accessToken, variables)}`);
    }
    if (request.bodyMode !== 'none' && !headers.has('content-type')) {
      if (request.bodyMode === 'json') headers.set('content-type', 'application/json');
      if (request.bodyMode === 'xml') headers.set('content-type', 'application/xml');
      if (request.bodyMode === 'text') headers.set('content-type', 'text/plain');
      if (request.bodyMode === 'form') headers.set('content-type', 'application/x-www-form-urlencoded');
    }
    let body: BodyInit | undefined;
    if (!['GET', 'HEAD'].includes(request.method) && request.bodyMode !== 'none') {
      if (request.bodyMode === 'form') {
        const form = new URLSearchParams();
        if (request.formFields.length) {
          for (const field of request.formFields) {
            if (field.enabled && field.name.trim()) form.append(field.name.trim(), renderVariables(field.value, variables));
          }
          body = form;
        } else body = renderVariables(request.body, variables);
      } else if (request.bodyMode === 'multipart') {
        const form = new FormData();
        for (const field of request.formFields) {
          if (field.enabled && field.name.trim()) form.append(field.name.trim(), renderVariables(field.value, variables));
        }
        body = form;
      } else body = renderVariables(request.body, variables);
    }
    const result = await executeHttpTransport({
      url,
      method: request.method,
      headers,
      body,
      timeoutMs: request.timeoutMs || dto.input.timeoutMs,
      followRedirects: request.followRedirects,
      network,
    });
    return finalize(result);
  }

  async import(workspaceId: string, dto: ImportApiClientCollectionDto) {
    const node = await this.requireNode(workspaceId, dto.input.nodeId);
    if (dto.input.kind === 'postmanEnvironment') {
      const environment = await this.importPostmanEnvironment(dto.input.path);
      const current = (node.payload ?? {}) as ApiClientNodePayload;
      const payload: ApiClientNodePayload = {
        ...current,
        formatVersion: 1,
        environments: { ...(current.environments ?? {}), [environment.name]: environment.variables },
        activeEnvironment: environment.name,
      };
      await workspaceRepository.updateNode(node.id, { payload });
      return { collectionName: node.title ?? 'API Client', payload };
    }
    const imported = dto.input.kind === 'postman'
      ? await this.importPostman(dto.input.path)
      : dto.input.kind === 'openapi'
        ? await this.importOpenApi(dto.input.path)
      : dto.input.kind === 'native'
        ? await this.importNative(dto.input.path)
        : await this.importBruno(dto.input.path);
    const current = (node.payload ?? {}) as Record<string, unknown>;
    const payload: ApiClientNodePayload = dto.input.kind === 'native'
      ? { ...current, ...imported.nativePayload, sourcePath: null }
      : {
          ...current,
          formatVersion: 1,
          sourceKind: dto.input.kind,
          sourcePath: dto.input.path,
          sourceCollection: imported.sourceCollection,
          requests: imported.requests,
          folders: imported.folders,
          variables: imported.variables,
          environments: imported.environments,
          activeEnvironment: Object.keys(imported.environments)[0] ?? null,
          collectionPreRequestScript: imported.collectionPreRequestScript,
          collectionPostResponseScript: imported.collectionPostResponseScript,
          compatibilityWarnings: imported.compatibilityWarnings,
          selectedRequestId: imported.requests[0]?.id ?? null,
        };
    if (dto.input.kind !== 'native') {
      const sourceRoot = await apiClientSourceRoot(dto.input.path, dto.input.kind);
      const sourceFingerprint = await apiClientSourceFingerprint(sourceRoot);
      payload.sync = {
        mode: (current as ApiClientNodePayload).sync?.mode ?? 'manual',
        conflictPolicy: (current as ApiClientNodePayload).sync?.conflictPolicy ?? 'ask',
        lastSyncedAt: new Date().toISOString(),
        sourceFingerprint,
        localFingerprint: apiClientPayloadFingerprint(payload),
        managedFiles: await apiClientManagedSourceFiles(sourceRoot, dto.input.kind),
      };
    }
    await workspaceRepository.updateNode(node.id, { payload });
    return { collectionName: imported.name, payload };
  }

  private async importPostman(path: string): Promise<ImportedCollection> {
    const collection = JSON.parse(await readLimited(path));
    if (!collection?.info || !Array.isArray(collection.item)) throw new Error('Invalid Postman Collection v2.1 file.');
    const variables = Object.fromEntries((collection.variable ?? []).filter((item: any) => item?.key && !item.disabled).map((item: any) => [String(item.key), String(item.value ?? '')]));
    const structure = postmanFolders(collection.item);
    const { item: _items, ...collectionMetadata } = collection;
    return {
      name: String(collection.info.name ?? basename(path, extname(path))),
      requests: collection.item
        .flatMap((item: any) => fromPostmanItem(item, [], collection.auth))
        .slice(0, IMPORT_LIMIT)
        .map((request: ApiClientRequestInput, sequence: number) => ({ ...request, folderId: structure.idsByPath.get(request.folder) ?? null, sequence })),
      folders: structure.folders,
      variables,
      environments: {},
      collectionPreRequestScript: scriptFromEvents(collection.event, 'prerequest'),
      collectionPostResponseScript: scriptFromEvents(collection.event, 'test'),
      sourceCollection: collectionMetadata,
      compatibilityWarnings: [],
    };
  }

  private async importPostmanEnvironment(path: string): Promise<{ name: string; variables: Record<string, string> }> {
    const environment = JSON.parse(await readLimited(path, 2 * 1024 * 1024));
    if (!Array.isArray(environment?.values)) throw new Error('Invalid Postman environment file.');
    return {
      name: String(environment.name || basename(path).replace(/\.postman_environment\.json$/i, '') || 'Postman'),
      variables: Object.fromEntries(environment.values
        .filter((item: any) => item?.key && item.enabled !== false)
        .map((item: any) => [String(item.key), String(item.value ?? '')])),
    };
  }

  private async importOpenApi(path: string): Promise<ImportedCollection> {
    const document = await bundledOpenApi(path);
    const imported = importOpenApiDocument(document);
    return {
      ...imported,
      environments: {},
      collectionPreRequestScript: '',
      collectionPostResponseScript: '',
      sourceCollection: structuredClone(document),
      compatibilityWarnings: imported.warnings,
    };
  }

  private async importNative(path: string): Promise<ImportedCollection> {
    const document = apiClientNativeCollectionSchema.parse(JSON.parse(await readLimited(path)));
    const payload = document.payload as ApiClientNodePayload;
    const requests = document.payload.requests as ApiClientRequestInput[];
    const variables = document.payload.variables;
    const environments = document.payload.environments;
    return {
      name: typeof document.name === 'string' && document.name.trim() ? document.name.trim() : basename(path, extname(path)),
      requests,
      folders: document.payload.folders,
      variables,
      environments,
      collectionPreRequestScript: payload.collectionPreRequestScript ?? '',
      collectionPostResponseScript: payload.collectionPostResponseScript ?? '',
      sourceCollection: payload.sourceCollection ?? null,
      compatibilityWarnings: payload.compatibilityWarnings ?? [],
      nativePayload: { ...payload, requests, variables, environments, formatVersion: 1 },
    };
  }

  private async importBruno(path: string): Promise<ImportedCollection> {
    const info = await stat(path);
    const root = info.isDirectory() ? path : dirname(path);
    const rootDocument = !info.isDirectory() && /^(?:opencollection|collection)\.(?:bru|ya?ml)$/i.test(basename(path));
    const files = info.isDirectory() || rootDocument ? await brunoFiles(root) : [path];
    const structure = await brunoFolders(root, files);
    const requests: ApiClientRequestInput[] = [];
    for (const file of files) {
      try {
        const format = /\.bru$/i.test(file) ? 'bru' : 'yml';
        const parsed = parseRequest(await readLimited(file, 2 * 1024 * 1024), { format });
        const request = fromBruno(parsed, file);
        if (request) {
          const relativeFolder = dirname(relative(root, file));
          const folderKey = relativeFolder === '.' ? '' : relativeFolder.split(/[/\\]+/).join('/');
          requests.push({
            ...request,
            folder: relativeFolder === '.' ? '' : relativeFolder.split(/[/\\]+/).join(' / '),
            folderId: folderKey ? structure.foldersByDirectory.get(folderKey)?.id ?? null : null,
            sequence: request.sequence,
          });
        }
      } catch {
        // Collection/folder/environment files are expected alongside requests.
      }
    }
    if (!requests.length) throw new Error('No HTTP requests were found in this Bruno collection.');
    let collection: any = null;
    for (const file of [join(root, 'collection.bru'), join(root, 'collection.yml'), join(root, 'collection.yaml'), join(root, 'opencollection.yml'), join(root, 'opencollection.yaml')]) {
      if (!await pathExists(file)) continue;
      try {
        collection = parseCollection(await readLimited(file, 2 * 1024 * 1024), { format: /\.bru$/i.test(file) ? 'bru' : 'yml' });
        break;
      } catch { /* Keep request import usable when collection metadata is invalid. */ }
    }
    let collectionName = basename(root);
    if (typeof collection?.brunoConfig?.name === 'string' && collection.brunoConfig.name.trim()) collectionName = collection.brunoConfig.name.trim();
    const configPath = join(root, 'bruno.json');
    if (await pathExists(configPath)) {
      try {
        const config = JSON.parse(await readLimited(configPath, 256 * 1024));
        if (typeof config?.name === 'string' && config.name.trim()) collectionName = config.name.trim();
      } catch { /* The directory name remains the safe fallback. */ }
    }
    const environments: Record<string, Record<string, string>> = {};
    const environmentRoot = join(root, 'environments');
    if (await pathExists(environmentRoot)) {
      for (const entry of await readdir(environmentRoot, { withFileTypes: true })) {
        if (!entry.isFile() || !/\.(?:bru|ya?ml)$/i.test(entry.name)) continue;
        try {
          const format = /\.bru$/i.test(entry.name) ? 'bru' : 'yml';
          const parsed = parseEnvironment(await readLimited(join(environmentRoot, entry.name), 2 * 1024 * 1024), { format });
          environments[basename(entry.name, extname(entry.name))] = variableRecord(parsed?.variables);
        } catch { /* An invalid environment must not discard valid requests. */ }
      }
    }
    const collectionRoot = collection?.collectionRoot ?? collection;
    const orderedRequests = requests
      .sort((left, right) => left.sequence - right.sequence)
      .slice(0, IMPORT_LIMIT)
      .map((request, sequence) => ({ ...request, sequence }));
    return {
      name: collectionName,
      requests: orderedRequests,
      folders: structure.folders,
      variables: variableRecord(collectionRoot?.request?.vars?.req),
      environments,
      collectionPreRequestScript: String(collectionRoot?.request?.script?.req ?? ''),
      collectionPostResponseScript: String(collectionRoot?.request?.script?.res ?? ''),
      sourceCollection: collection ? structuredClone(collection) : null,
      compatibilityWarnings: [],
    };
  }

  async export(workspaceId: string, dto: ExportApiClientCollectionDto) {
    const node = await this.requireNode(workspaceId, dto.input.nodeId);
    const destinationInfo = await stat(dto.input.path);
    if (!destinationInfo.isDirectory()) throw new Error('The export destination must be a directory.');
    const payload = (node.payload ?? {}) as ApiClientNodePayload;
    const requests = (payload.requests ?? []).map((request) => persistedApiClientRequestSchema.parse(request));
    const folders = payload.folders ?? [];
    const output = await availableCollectionDirectory(dto.input.path, node.title ?? 'Orkestrai API');
    await mkdir(output, { recursive: false });
    const openCollection = dto.input.kind === 'openCollection';
    if (!openCollection) {
      await writeFile(join(output, 'bruno.json'), `${JSON.stringify({
        version: '1',
        name: node.title ?? 'Orkestrai API',
        type: 'collection',
        ignore: ['node_modules', '.git'],
      }, null, 2)}\n`, 'utf8');
    }
    const storedCollection = ['bruno', 'openCollection'].includes(payload.sourceKind ?? '') && payload.sourceCollection
      ? structuredClone(payload.sourceCollection) as any
      : {};
    const originalCollection = storedCollection.collectionRoot ?? storedCollection;
    const collection = {
      ...originalCollection,
      request: {
        ...(originalCollection.request ?? {}),
        auth: originalCollection.request?.auth ?? { mode: 'none' },
        script: {
          ...(originalCollection.request?.script ?? {}),
          req: payload.collectionPreRequestScript ?? '',
          res: payload.collectionPostResponseScript ?? '',
        },
        vars: {
          ...(originalCollection.request?.vars ?? {}),
          req: Object.entries(payload.variables ?? {}).map(([name, value]) => ({ name, value, enabled: true })),
          res: originalCollection.request?.vars?.res ?? [],
        },
      },
    };
    await writeFile(
      join(output, openCollection ? 'opencollection.yml' : 'collection.bru'),
      stringifyCollection(collection, openCollection ? { name: node.title ?? 'Orkestrai API' } : {}, { format: openCollection ? 'yml' : 'bru' }),
      'utf8',
    );

    const usedFiles = new Map<string, number>();
    for (const folder of [...folders].sort((left, right) => left.sequence - right.sequence)) {
      const directory = join(output, ...folderSegments(folders, folder.id));
      await mkdir(directory, { recursive: true });
      const original = folder.sourceData?.kind === 'bruno' ? structuredClone(folder.sourceData.data) as any : {};
      const folderDocument = {
        ...original,
        meta: { ...(original.meta ?? {}), name: folder.name, seq: folder.sequence + 1 },
        request: original.request ?? { auth: { mode: 'inherit' }, headers: [], script: {}, vars: {}, tests: '' },
        settings: original.settings ?? {},
        docs: original.docs ?? '',
      };
      await writeFile(join(directory, openCollection ? 'folder.yml' : 'folder.bru'), stringifyFolder(folderDocument, { format: openCollection ? 'yml' : 'bru' }), 'utf8');
    }
    const ordered = [...requests].sort((left, right) => left.sequence - right.sequence);
    for (const [sequence, request] of ordered.entries()) {
      const directory = join(output, ...requestFolderSegments(folders, request));
      await mkdir(directory, { recursive: true });
      const base = safePathSegment(request.name, `request-${sequence + 1}`);
      const key = join(directory, base).toLowerCase();
      const duplicate = (usedFiles.get(key) ?? 0) + 1;
      usedFiles.set(key, duplicate);
      const extension = openCollection ? 'yml' : 'bru';
      const filename = duplicate === 1 ? `${base}.${extension}` : `${base}-${duplicate}.${extension}`;
      await writeFile(join(directory, filename), stringifyRequest(toBrunoRequest(request, sequence), { format: openCollection ? 'yml' : 'bru' }), 'utf8');
    }

    const environmentEntries = Object.entries(payload.environments ?? {});
    if (environmentEntries.length) {
      const environmentDirectory = join(output, 'environments');
      await mkdir(environmentDirectory, { recursive: true });
      for (const [name, values] of environmentEntries) {
        const environment = {
          variables: Object.entries(values).map(([variableName, value]) => ({ name: variableName, value, enabled: true, secret: false })),
        };
        const extension = openCollection ? 'yml' : 'bru';
        await writeFile(join(environmentDirectory, `${safePathSegment(name, 'environment')}.${extension}`), stringifyEnvironment(environment, { format: openCollection ? 'yml' : 'bru' }), 'utf8');
      }
    }
    return { kind: dto.input.kind, path: output, files: requests.length + folders.length + environmentEntries.length + (openCollection ? 1 : 2) };
  }

  private async requireNode(workspaceId: string, nodeId: string) {
    const node = await workspaceRepository.getNode(nodeId);
    if (!node || node.workspaceId !== workspaceId || node.type !== 'apiClient') throw new Error('API Client node not found.');
    return node;
  }
}

export const apiClientService = new ApiClientService();
