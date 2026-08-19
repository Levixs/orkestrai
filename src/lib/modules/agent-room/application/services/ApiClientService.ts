import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { uuidv7 } from '@beeblock/svelar/support';
import { parseRequest } from '@usebruno/filestore';
import { apiClientRequestSchema, type ApiClientRequestInput } from '../../contracts/schemas/apiClient.schema.js';
import { ExecuteApiClientRequestDto, type ImportApiClientCollectionDto } from '../dto/ApiClientDtos.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';

const RESPONSE_LIMIT = 2 * 1024 * 1024;
const IMPORT_LIMIT = 500;
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

type ImportedCollection = {
  name: string;
  requests: ApiClientRequestInput[];
  variables: Record<string, string>;
};

function renderVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/{{\s*([^{}]+?)\s*}}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match
  );
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
  return { body: '', bodyMode: 'none' };
}

function brunoAuth(request: any): ApiClientRequestInput['auth'] {
  const mode = String(request?.auth?.mode ?? 'none');
  if (mode === 'bearer') return { type: 'bearer', token: String(request.auth.bearer?.token ?? ''), username: '', password: '' };
  if (mode === 'basic') return { type: 'basic', token: '', username: String(request.auth.basic?.username ?? ''), password: String(request.auth.basic?.password ?? '') };
  return { type: 'none', token: '', username: '', password: '' };
}

function postmanAuth(auth: any): ApiClientRequestInput['auth'] {
  const values = (kind: string) => Object.fromEntries(
    (Array.isArray(auth?.[kind]) ? auth[kind] : []).filter((entry: any) => entry?.key).map((entry: any) => [String(entry.key), String(entry.value ?? '')])
  );
  if (auth?.type === 'bearer') return { type: 'bearer', token: values('bearer').token ?? '', username: '', password: '' };
  if (auth?.type === 'basic') {
    const basic = values('basic');
    return { type: 'basic', token: '', username: basic.username ?? '', password: basic.password ?? '' };
  }
  return { type: 'none', token: '', username: '', password: '' };
}

function fromBruno(parsed: any, sourcePath: string): ApiClientRequestInput | null {
  const request = parsed?.request;
  if (!request?.url || !request?.method) return null;
  const body = requestBody(parsed);
  return {
    id: uuidv7(),
    name: String(parsed.name || basename(sourcePath, extname(sourcePath))),
    method: httpMethod(request.method),
    url: String(request.url),
    headers: Array.isArray(request.headers)
      ? request.headers.map((header: any) => ({ id: uuidv7(), name: String(header.name ?? ''), value: String(header.value ?? ''), enabled: header.enabled !== false }))
      : [],
    auth: brunoAuth(request),
    ...body,
    sourcePath,
  };
}

function postmanUrl(url: unknown): string {
  if (typeof url === 'string') return url;
  return String((url as { raw?: unknown } | null)?.raw ?? '');
}

function fromPostmanItem(item: any, lineage: string[] = [], inheritedAuth: any = null): ApiClientRequestInput[] {
  if (Array.isArray(item?.item)) {
    return item.item.flatMap((child: any) => fromPostmanItem(child, [...lineage, String(item.name ?? '')].filter(Boolean), item.auth ?? inheritedAuth));
  }
  if (!item?.request) return [];
  const rawBody = item.request.body?.raw;
  const bodyMode = item.request.body?.mode === 'raw'
    ? (/json/i.test(String(item.request.body?.options?.raw?.language ?? '')) ? 'json' : 'text')
    : item.request.body?.mode === 'urlencoded' ? 'form' : 'none';
  const body = bodyMode === 'form'
    ? (Array.isArray(item.request.body?.urlencoded) ? item.request.body.urlencoded : [])
      .filter((field: any) => !field.disabled)
      .map((field: any) => `${encodeFormPart(field.key)}=${encodeFormPart(field.value)}`)
      .join('&')
    : typeof rawBody === 'string' ? rawBody : '';
  return [{
    id: String(item.id || uuidv7()),
    name: [...lineage, String(item.name || 'Request')].join(' / '),
    method: httpMethod(item.request.method),
    url: postmanUrl(item.request.url),
    headers: Array.isArray(item.request.header)
      ? item.request.header.map((header: any) => ({ id: uuidv7(), name: String(header.key ?? ''), value: String(header.value ?? ''), enabled: !header.disabled }))
      : [],
    auth: postmanAuth(item.request.auth?.type === 'noauth' ? null : (item.request.auth ?? inheritedAuth)),
    body,
    bodyMode,
    sourcePath: null,
  }];
}

async function brunoFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  const visit = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(?:bru|ya?ml)$/i.test(entry.name)) output.push(path);
      if (output.length >= IMPORT_LIMIT) return;
    }
  };
  await visit(root);
  return output;
}

async function readLimited(path: string, limit = 10 * 1024 * 1024): Promise<string> {
  const info = await stat(path);
  if (!info.isFile() || info.size > limit) throw new Error('Collection file is invalid or exceeds 10 MB.');
  return readFile(path, 'utf8');
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

  async execute(workspaceId: string, dto: ExecuteApiClientRequestDto) {
    await this.requireNode(workspaceId, dto.input.nodeId);
    const request = dto.input.request;
    const url = new URL(renderVariables(request.url, dto.input.variables));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS requests are allowed.');
    const headers = new Headers();
    for (const header of request.headers) {
      if (header.enabled && header.name.trim()) headers.append(header.name.trim(), renderVariables(header.value, dto.input.variables));
    }
    if (request.auth.type === 'bearer' && request.auth.token && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${renderVariables(request.auth.token, dto.input.variables)}`);
    }
    if (request.auth.type === 'basic' && !headers.has('authorization')) {
      const username = renderVariables(request.auth.username, dto.input.variables);
      const password = renderVariables(request.auth.password, dto.input.variables);
      headers.set('authorization', `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
    }
    if (request.bodyMode !== 'none' && !headers.has('content-type')) {
      if (request.bodyMode === 'json') headers.set('content-type', 'application/json');
      if (request.bodyMode === 'xml') headers.set('content-type', 'application/xml');
      if (request.bodyMode === 'text') headers.set('content-type', 'text/plain');
      if (request.bodyMode === 'form') headers.set('content-type', 'application/x-www-form-urlencoded');
    }
    const body = ['GET', 'HEAD'].includes(request.method) || request.bodyMode === 'none'
      ? undefined
      : renderVariables(request.body, dto.input.variables);
    const startedAt = performance.now();
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(dto.input.timeoutMs),
      redirect: 'follow',
    });
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_LIMIT) {
        await reader.cancel();
        throw new Error('Response exceeds the 2 MB preview limit.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const contentType = response.headers.get('content-type') ?? '';
    const textual = /(?:json|text|xml|javascript|html|urlencoded)/i.test(contentType);
    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      durationMs: Math.round(performance.now() - startedAt),
      size,
      contentType,
      headers: Object.fromEntries(response.headers.entries()),
      body: textual ? new TextDecoder().decode(bytes) : '',
      binary: !textual,
    };
  }

  async import(workspaceId: string, dto: ImportApiClientCollectionDto) {
    const node = await this.requireNode(workspaceId, dto.input.nodeId);
    const imported = dto.input.kind === 'postman'
      ? await this.importPostman(dto.input.path)
      : await this.importBruno(dto.input.path);
    const current = (node.payload ?? {}) as Record<string, unknown>;
    const payload = {
      ...current,
      sourceKind: dto.input.kind,
      sourcePath: dto.input.path,
      requests: imported.requests,
      variables: imported.variables,
      selectedRequestId: imported.requests[0]?.id ?? null,
    };
    await workspaceRepository.updateNode(node.id, { payload });
    return { collectionName: imported.name, payload };
  }

  private async importPostman(path: string): Promise<ImportedCollection> {
    const collection = JSON.parse(await readLimited(path));
    if (!collection?.info || !Array.isArray(collection.item)) throw new Error('Invalid Postman Collection v2.1 file.');
    const variables = Object.fromEntries((collection.variable ?? []).filter((item: any) => item?.key).map((item: any) => [String(item.key), String(item.value ?? '')]));
    return {
      name: String(collection.info.name ?? basename(path, extname(path))),
      requests: collection.item.flatMap((item: any) => fromPostmanItem(item, [], collection.auth)).slice(0, IMPORT_LIMIT),
      variables,
    };
  }

  private async importBruno(path: string): Promise<ImportedCollection> {
    const info = await stat(path);
    const root = info.isDirectory() ? path : dirname(path);
    const files = info.isDirectory() ? await brunoFiles(path) : [path];
    const requests: ApiClientRequestInput[] = [];
    for (const file of files) {
      try {
        const format = /\.bru$/i.test(file) ? 'bru' : 'yml';
        const parsed = parseRequest(await readLimited(file, 2 * 1024 * 1024), { format });
        const request = fromBruno(parsed, file);
        if (request) requests.push(request);
      } catch {
        // Collection/folder/environment files are expected alongside requests.
      }
    }
    if (!requests.length) throw new Error('No HTTP requests were found in this Bruno collection.');
    return { name: basename(root), requests: requests.slice(0, IMPORT_LIMIT), variables: {} };
  }

  private async requireNode(workspaceId: string, nodeId: string) {
    const node = await workspaceRepository.getNode(nodeId);
    if (!node || node.workspaceId !== workspaceId || node.type !== 'apiClient') throw new Error('API Client node not found.');
    return node;
  }
}

export const apiClientService = new ApiClientService();
