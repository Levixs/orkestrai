import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { ApiClientRequestInput } from '../../contracts/schemas/apiClient.schema.js';
import type { ApiClientNodePayload } from '../../domain/types.js';
import type { ApiClientFolder } from '../../domain/types.js';
import { ApiClientScriptExecutionError } from './ApiClientScriptSandbox.js';
import { emptyScriptFlow, mergeScriptScopes, type ApiClientRuntimeResult, type ApiClientScriptContext, type ApiClientScriptFlow, type ApiClientScriptTest, type ApiClientScriptVisualization } from './ApiClientScriptRuntimeTypes.js';

const require = createRequire(import.meta.url);
const postmanRuntime = require('postman-runtime') as any;
const postman = require('postman-collection') as any;
const { CookieJar } = require('@postman/tough-cookie') as any;

const POSTMAN_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const BUNDLED_PACKAGES = Object.fromEntries([
  'ajv',
  'backbone',
  'buffer',
  'chai',
  'cheerio',
  'crypto-js',
  'csv-parse/lib/sync',
  'lodash',
  'moment',
  'postman-collection',
  'tv4',
  'uuid',
  'xml2js',
].map((name) => [name, { data: `module.exports = require(${JSON.stringify(name)});` }]));

type IterationMetadata = { index: number; count: number };

function iterationPrelude(metadata: IterationMetadata): string {
  return `const __orkestraiPostmanPm_1f7c89 = pm; pm = new Proxy({}, { get(_target, property) { const source = __orkestraiPostmanPm_1f7c89; if (property === 'info') return new Proxy({}, { get(_infoTarget, key) { if (key === 'iteration') return ${metadata.index}; if (key === 'iterationCount') return ${metadata.count}; return Reflect.get(source.info, key, source.info); } }); const value = Reflect.get(source, property, source); return typeof value === 'function' ? value.bind(source) : value; } });`;
}

function event(listen: 'prerequest' | 'test', script: string, metadata: IterationMetadata) {
  return script.trim() ? { listen, script: { type: 'text/javascript', exec: [iterationPrelude(metadata), ...script.split(/\r?\n/)] } } : null;
}

function sourceEvents(events: unknown, metadata: IterationMetadata) {
  return (Array.isArray(events) ? events : []).map((source) => {
    const value = structuredClone(source);
    const exec = value?.script?.exec;
    if (Array.isArray(exec)) value.script.exec = [iterationPrelude(metadata), ...exec];
    else if (typeof exec === 'string') value.script.exec = [iterationPrelude(metadata), exec];
    return value;
  });
}

function auth(request: ApiClientRequestInput) {
  if (request.auth.type === 'bearer') return { type: 'bearer', bearer: [{ key: 'token', value: request.auth.token, type: 'string' }] };
  if (request.auth.type === 'basic') return { type: 'basic', basic: [{ key: 'username', value: request.auth.username, type: 'string' }, { key: 'password', value: request.auth.password, type: 'string' }] };
  if (request.auth.type === 'apiKey') return { type: 'apikey', apikey: [{ key: 'key', value: request.auth.key, type: 'string' }, { key: 'value', value: request.auth.value, type: 'string' }, { key: 'in', value: request.auth.placement, type: 'string' }] };
  if (request.auth.type === 'oauth2') return { type: 'oauth2', oauth2: [{ key: 'accessToken', value: request.auth.oauth2.accessToken, type: 'string' }, { key: 'tokenType', value: request.auth.oauth2.tokenType || 'Bearer', type: 'string' }] };
  return { type: 'noauth' };
}

function body(request: ApiClientRequestInput) {
  if (request.protocol === 'graphql' && !['GET', 'HEAD'].includes(request.method)) {
    let variables: unknown = {};
    try { variables = JSON.parse(request.graphql.variables || '{}'); }
    catch { /* The service returns a precise validation error for malformed GraphQL variables. */ }
    return {
      mode: 'raw',
      raw: JSON.stringify({
        query: request.graphql.query,
        variables,
        ...(request.graphql.operationName ? { operationName: request.graphql.operationName } : {}),
      }),
      options: { raw: { language: 'json' } },
    };
  }
  if (request.bodyMode === 'none') return undefined;
  if (request.bodyMode === 'form') {
    const values = request.formFields.length
      ? request.formFields
      : request.body.split('&').filter(Boolean).map((part, index) => {
          const [key, ...value] = part.split('=');
          return { id: `form-${index}`, name: decodeURIComponent(key), value: decodeURIComponent(value.join('=')), enabled: true };
        });
    return { mode: 'urlencoded', urlencoded: values.map((field) => ({ key: field.name, value: field.value, disabled: !field.enabled, type: 'text' })) };
  }
  if (request.bodyMode === 'multipart') return { mode: 'formdata', formdata: request.formFields.map((field) => ({ key: field.name, value: field.value, disabled: !field.enabled, type: 'text' })) };
  return {
    mode: 'raw',
    raw: request.body,
    options: { raw: { language: request.bodyMode === 'json' ? 'json' : request.bodyMode === 'xml' ? 'xml' : 'text' } },
  };
}

function requestUrl(request: ApiClientRequestInput): string {
  const enabled = request.params.filter((param) => param.enabled && param.name.trim());
  const query = new URLSearchParams();
  for (const param of enabled) query.append(param.name, param.value);
  if (request.protocol === 'graphql' && request.method === 'GET') {
    query.set('query', request.graphql.query);
    if (request.graphql.variables.trim()) query.set('variables', request.graphql.variables);
    if (request.graphql.operationName) query.set('operationName', request.graphql.operationName);
  }
  const rendered = query.toString().replace(/%7B%7B(.+?)%7D%7D/gi, '{{$1}}');
  return rendered ? `${request.url}${request.url.includes('?') ? '&' : '?'}${rendered}` : request.url;
}

function item(request: ApiClientRequestInput, metadata: IterationMetadata) {
  const requestHeaders = request.headers.map((header) => ({ key: header.name, value: header.value, disabled: !header.enabled, type: 'text' }));
  if (request.protocol === 'graphql' && !['GET', 'HEAD'].includes(request.method) && !requestHeaders.some((header) => header.key.toLowerCase() === 'content-type')) {
    requestHeaders.push({ key: 'Content-Type', value: 'application/json', disabled: false, type: 'text' });
  }
  return {
    id: request.id,
    name: request.name,
    event: [event('prerequest', request.preRequestScript, metadata), event('test', request.postResponseScript, metadata)].filter(Boolean),
    request: {
      method: request.method,
      header: requestHeaders,
      auth: auth(request),
      url: requestUrl(request),
      body: body(request),
    },
  };
}

function collectionItems(requests: ApiClientRequestInput[], folders: ApiClientFolder[], metadata: IterationMetadata) {
  const requestsByFolder = new Map<string | null, ApiClientRequestInput[]>();
  for (const request of requests) {
    const key = request.folderId ?? null;
    requestsByFolder.set(key, [...(requestsByFolder.get(key) ?? []), request]);
  }
  const children = new Map<string | null, ApiClientFolder[]>();
  for (const folder of folders) children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder]);
  const visit = (parentId: string | null): any[] => [
    ...(children.get(parentId) ?? []).sort((left, right) => left.sequence - right.sequence).map((folder) => {
      const source = folder.sourceData?.kind === 'postman' ? folder.sourceData.data as any : {};
      return {
        id: folder.id,
        name: folder.name,
        event: sourceEvents(source.event, metadata),
        item: visit(folder.id),
      };
    }),
    ...(requestsByFolder.get(parentId) ?? []).sort((left, right) => left.sequence - right.sequence).map((request) => item(request, metadata)),
  ];
  return visit(null);
}

function variableValues(values: Record<string, unknown>) {
  return Object.entries(values).map(([key, value]) => ({ key, value }));
}

function stringRecord(values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? '')]));
}

function safeLog(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    if (value && typeof value === 'object' && typeof (value as any).toJSON === 'function') return JSON.stringify((value as any).toJSON());
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function headers(response: any): Record<string, string> {
  const output: Record<string, string> = {};
  response?.headers?.each?.((header: any) => { output[String(header.key).toLowerCase()] = String(header.value ?? ''); });
  return output;
}

function responseBody(response: any): string {
  if (Buffer.isBuffer(response?.stream)) return response.stream.toString('utf8');
  if (typeof response?.text === 'function') return String(response.text());
  return String(response?.body ?? '');
}

function mapResponse(response: any) {
  const value = responseBody(response);
  const responseHeaders = headers(response);
  const contentType = responseHeaders['content-type'] ?? '';
  const size = typeof response?.size === 'function' ? Number(response.size()?.total ?? Buffer.byteLength(value)) : Buffer.byteLength(value);
  return {
    status: Number(response?.code ?? 0),
    statusText: String(response?.status ?? ''),
    ok: Number(response?.code ?? 0) >= 200 && Number(response?.code ?? 0) < 300,
    durationMs: Number(response?.responseTime ?? 0),
    size,
    contentType,
    headers: responseHeaders,
    body: value,
    binary: !/(?:json|text|xml|javascript|html|urlencoded|graphql)/i.test(contentType),
  };
}

function updateRequest(original: ApiClientRequestInput, request: any): ApiClientRequestInput {
  const existing = new Map(original.headers.map((header) => [header.name.toLowerCase(), header]));
  const nextHeaders: ApiClientRequestInput['headers'] = [];
  request?.headers?.each?.((header: any, index: number) => {
    const name = String(header.key ?? '');
    nextHeaders.push({ id: existing.get(name.toLowerCase())?.id ?? `postman-header-${index}`, name, value: String(header.value ?? ''), enabled: !header.disabled });
  });
  const rawBody = request?.body?.raw;
  return {
    ...original,
    method: String(request?.method ?? original.method).toUpperCase() as ApiClientRequestInput['method'],
    url: String(request?.url?.toString?.() ?? original.url),
    headers: nextHeaders,
    body: rawBody === undefined ? original.body : String(rawBody),
  };
}

async function cookieJar(network: NonNullable<ApiClientNodePayload['network']>) {
  const jar = new CookieJar();
  for (const cookie of network.cookies) {
    const origin = `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`;
    const attributes = [`${cookie.key}=${cookie.value}`, `Path=${cookie.path || '/'}`];
    if (!cookie.hostOnly) attributes.push(`Domain=${cookie.domain}`);
    if (cookie.secure) attributes.push('Secure');
    if (cookie.httpOnly) attributes.push('HttpOnly');
    if (cookie.expires) attributes.push(`Expires=${new Date(cookie.expires).toUTCString()}`);
    await new Promise<void>((resolve) => jar.setCookie(attributes.join('; '), origin, { ignoreError: true }, () => resolve()));
  }
  jar.allowProgrammaticAccess = () => true;
  return jar;
}

async function serializeCookies(jar: any): Promise<NonNullable<ApiClientNodePayload['network']>['cookies']> {
  const serialized = await new Promise<any>((resolve, reject) => jar.serialize((error: Error | null, value: any) => error ? reject(error) : resolve(value)));
  return (serialized.cookies ?? []).map((cookie: any) => ({
    key: String(cookie.key ?? ''),
    value: String(cookie.value ?? ''),
    domain: String(cookie.domain ?? ''),
    path: String(cookie.path ?? '/'),
    expires: cookie.expires && cookie.expires !== 'Infinity' ? new Date(cookie.expires).toISOString() : null,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    hostOnly: cookie.hostOnly !== false,
  }));
}

function runtimeProxy(network: NonNullable<ApiClientNodePayload['network']>) {
  if (!network.proxyUrl.trim()) return undefined;
  const proxy = new URL(network.proxyUrl.trim());
  return new postman.ProxyConfigList(null, [{
    match: 'http+https://*:*/*',
    host: proxy.hostname,
    port: Number(proxy.port || (proxy.protocol === 'https:' ? 443 : 80)),
    protocol: proxy.protocol.replace(':', ''),
    tunnel: true,
    authenticate: Boolean(proxy.username),
    username: decodeURIComponent(proxy.username),
    password: decodeURIComponent(proxy.password),
  }]);
}

function runtimeCertificates(network: NonNullable<ApiClientNodePayload['network']>) {
  const certificate = network.clientPfxPath
    ? { name: 'Orkestrai client certificate', matches: ['https://*:*/*'], pfx: { src: network.clientPfxPath }, passphrase: network.clientKeyPassphrase }
    : network.clientCertificatePath && network.clientKeyPath
      ? { name: 'Orkestrai client certificate', matches: ['https://*:*/*'], cert: { src: network.clientCertificatePath }, key: { src: network.clientKeyPath }, passphrase: network.clientKeyPassphrase }
      : null;
  return certificate ? new postman.CertificateList(null, [certificate]) : undefined;
}

function scriptError(stage: ApiClientScriptContext['stage'], error: unknown) {
  const detail = error instanceof Error ? error.message : safeLog(error);
  return new ApiClientScriptExecutionError(stage, detail);
}

export async function runPostmanRequest(context: ApiClientScriptContext): Promise<ApiClientRuntimeResult> {
  const allRequests = context.requests?.length ? context.requests : [context.request];
  const iterationMetadata = { index: context.iterationIndex ?? 0, count: context.iterationCount ?? 1 };
  const collection = new postman.Collection({
    info: { name: context.collectionName, schema: POSTMAN_SCHEMA },
    variable: variableValues(context.scopes.collection),
    event: [event('prerequest', context.collectionPreRequestScript ?? '', iterationMetadata), event('test', context.collectionPostResponseScript ?? '', iterationMetadata)].filter(Boolean),
    item: collectionItems(allRequests, context.folders ?? [], iterationMetadata),
  });
  const environment = new postman.VariableScope({ values: variableValues(context.scopes.environment) });
  const globals = new postman.VariableScope({ values: variableValues(context.scopes.globals) });
  const localVariables = new postman.VariableScope({ values: variableValues(context.scopes.runtime) });
  const vaultSecrets = new postman.VariableScope({ values: variableValues(context.secrets ?? {}) });
  vaultSecrets._ = { ...(vaultSecrets._ ?? {}), allowScriptAccess: async () => true };
  const jar = await cookieJar(context.network);
  const logs: string[] = [];
  const tests: ApiClientScriptTest[] = [];
  const visualizations: ApiClientScriptVisualization[] = [];
  const flow: ApiClientScriptFlow = emptyScriptFlow();
  let resultingScopes = mergeScriptScopes(context.scopes);
  let response: ReturnType<typeof mapResponse> | undefined;
  let scriptedRequest = structuredClone(context.request);
  let scriptFailure: ApiClientScriptExecutionError | null = null;

  const captureScopes = (results: any[]) => {
    for (const entry of results ?? []) {
      const result = entry?.result;
      if (result?.collectionVariables?.toObject) resultingScopes.collection = result.collectionVariables.toObject();
      if (result?.environment?.toObject) resultingScopes.environment = result.environment.toObject();
      if (result?.globals?.toObject) resultingScopes.globals = result.globals.toObject();
      if (result?._variables?.toObject) resultingScopes.runtime = result._variables.toObject();
      if (result?.data && typeof result.data === 'object') resultingScopes.iteration = { ...result.data };
    }
  };

  const requestById = new Map(allRequests.map((request) => [request.id, request]));
  const requestByName = new Map(allRequests.map((request) => [request.name, request]));
  const requestResolver = (reference: string, ...args: any[]) => {
    const callback = args.at(-1);
    const found = requestById.get(reference) ?? requestByName.get(reference);
    if (!found) return callback(new Error(`Collection request not found: ${reference}`));
    callback(null, {
      info: { name: context.collectionName, schema: POSTMAN_SCHEMA },
      variable: variableValues(context.scopes.collection),
      event: collection.events.toJSON(),
      item: [item(found, iterationMetadata)],
    });
  };

  const requester: Record<string, unknown> = {
    cookieJar: jar,
    disableCookies: !context.network.cookieJarEnabled,
    followRedirects: context.request.followRedirects,
    strictSSL: context.network.rejectUnauthorized,
    maxResponseSize: MAX_RESPONSE_BYTES,
    implicitCacheControl: false,
    implicitTraceHeader: false,
    timings: true,
    maxInvokableNestedRequests: 5,
  };
  if (context.network.caPath) requester.extendedRootCA = await readFile(context.network.caPath, 'utf8');

  const options = {
    entrypoint: { execute: context.request.id, lookupStrategy: 'idOrName' },
    environment,
    globals,
    localVariables,
    vaultSecrets,
    data: [context.scopes.iteration],
    iterationCount: 1,
    timeout: { request: context.request.timeoutMs, script: 5_000 },
    requester,
    proxies: runtimeProxy(context.network),
    certificates: runtimeCertificates(context.network),
    script: {
      requestResolver,
      packageResolver: (_input: unknown, callback: (error: Error | null, packages?: Record<string, { data: string }>) => void) => callback(null, BUNDLED_PACKAGES),
    },
  };

  await new Promise<void>((resolve, reject) => {
    new postmanRuntime.Runner().run(collection, options, (runError: Error | null, run: any) => {
      if (runError) return reject(scriptError('requestPreRequest', runError));
      run.start({
        console: (_cursor: unknown, level: string, ...values: unknown[]) => {
          const text = values.map(safeLog).join(' ');
          logs.push(`${level === 'log' ? '' : `[${level}] `}${text}`.slice(0, 20_000));
        },
        assertion: (_cursor: unknown, assertions: any[]) => {
          for (const assertion of assertions ?? []) tests.push({
            id: `postman-test-${tests.length}`,
            label: String(assertion.name ?? `Test ${tests.length + 1}`),
            passed: !assertion.error,
            actual: String(assertion.error?.message ?? ''),
            expected: '',
          });
        },
        prerequest: (error: Error | null, _cursor: unknown, results: any[]) => {
          const failure = error ?? results?.find((result) => result.error)?.error;
          if (failure && !scriptFailure) scriptFailure = scriptError('requestPreRequest', failure);
          captureScopes(results);
          for (const result of results ?? []) {
            if (Object.hasOwn(result.result?.return ?? {}, 'nextRequest')) flow.nextRequest = result.result.return.nextRequest;
          }
        },
        test: (error: Error | null, _cursor: unknown, results: any[]) => {
          const failure = error ?? results?.find((result) => result.error)?.error;
          if (failure && !scriptFailure) scriptFailure = scriptError('requestPostResponse', failure);
          captureScopes(results);
          for (const result of results ?? []) {
            if (Object.hasOwn(result.result?.return ?? {}, 'nextRequest')) flow.nextRequest = result.result.return.nextRequest;
          }
        },
        request: (error: Error | null, _cursor: unknown, runtimeResponse: any, runtimeRequest: any, runtimeItem: any) => {
          if (String(runtimeItem?.id ?? '') !== context.request.id) return;
          if (error && !scriptFailure) scriptFailure = scriptError('requestPreRequest', error);
          scriptedRequest = updateRequest(context.request, runtimeRequest);
          if (runtimeResponse) response = mapResponse(runtimeResponse);
        },
        item: (error: Error | null, _cursor: unknown, runtimeItem: any, visualizer: any, result: any) => {
          if (String(runtimeItem?.id ?? '') !== context.request.id) return;
          if (error && !scriptFailure) scriptFailure = scriptError('requestPostResponse', error);
          flow.skipRequest = Boolean(result?.isSkipped);
          if (visualizer?.processedTemplate) visualizations.push({ type: 'html', content: String(visualizer.processedTemplate), data: visualizer.data });
        },
        exception: (_cursor: unknown, error: Error) => { if (!scriptFailure) scriptFailure = scriptError('requestPostResponse', error); },
        done: (error: Error | null) => error ? reject(scriptError('requestPostResponse', error)) : resolve(),
      });
    });
  });
  if (scriptFailure) throw scriptFailure;
  if (flow.nextRequest === null) flow.stopExecution = true;

  return {
    request: scriptedRequest,
    response,
    scopes: resultingScopes,
    logs: logs.slice(0, 200),
    tests: tests.slice(0, 300),
    flow,
    visualizations: visualizations.slice(0, 20),
    cookies: await serializeCookies(jar),
    secrets: stringRecord(vaultSecrets.toObject()),
  };
}
