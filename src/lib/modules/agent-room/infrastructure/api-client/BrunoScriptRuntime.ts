import { createRequire } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ApiClientRequestInput } from '../../contracts/schemas/apiClient.schema.js';
import { ApiClientScriptExecutionError } from './ApiClientScriptSandbox.js';
import { emptyScriptFlow, mergeScriptScopes, type ApiClientRuntimeResult, type ApiClientScriptContext, type ApiClientScriptScopes, type ApiClientScriptTest, type ApiClientScriptVisualization } from './ApiClientScriptRuntimeTypes.js';

const require = createRequire(import.meta.url);
const { ScriptRuntime, TestRuntime, AssertRuntime, VarsRuntime } = require('@usebruno/js') as {
  ScriptRuntime: new (options: { runtime: 'quickjs' }) => any;
  TestRuntime: new (options: { runtime: 'quickjs' }) => any;
  AssertRuntime: new (options: { runtime: 'quickjs' }) => any;
  VarsRuntime: new (options: { runtime: 'quickjs' }) => any;
};
const { cookies: brunoCookies } = require('@usebruno/requests') as any;
const cookieExecution = new AsyncLocalStorage<boolean>();
let cookieQueue: Promise<void> = Promise.resolve();

function headerRecord(request: ApiClientRequestInput): Record<string, string> {
  return Object.fromEntries(request.headers.filter((header) => header.enabled && header.name.trim()).map((header) => [header.name, header.value]));
}

function internalRequest(context: ApiClientScriptContext) {
  const request = context.request;
  return {
    name: request.name,
    pathname: request.sourcePath ?? undefined,
    url: request.url,
    method: request.method,
    headers: headerRecord(request),
    data: request.body,
    timeout: request.timeoutMs,
    collectionVariables: context.scopes.collection,
    globalEnvironmentVariables: context.scopes.globals,
    folderVariables: context.folderVariables ?? {},
    requestVariables: context.requestVariables ?? {},
    promptVariables: {},
    runnerIterationDetails: {
      iterationData: context.scopes.iteration,
      iterationIndex: context.iterationIndex ?? 0,
      totalIterations: context.iterationCount ?? 1,
    },
    certsAndProxyConfig: networkConfig(context),
  };
}

async function replaceBrunoCookies(context: ApiClientScriptContext) {
  await brunoCookies.cookieJar.removeAllCookies();
  for (const cookie of context.network.cookies) {
    const host = cookie.domain.replace(/^\./, '');
    const attributes = [`${cookie.key}=${cookie.value}`, `Path=${cookie.path || '/'}`];
    if (!cookie.hostOnly) attributes.push(`Domain=${cookie.domain}`);
    if (cookie.expires) attributes.push(`Expires=${new Date(cookie.expires).toUTCString()}`);
    if (cookie.secure) attributes.push('Secure');
    if (cookie.httpOnly) attributes.push('HttpOnly');
    await brunoCookies.cookieJar.setCookie(attributes.join('; '), `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path || '/'}`, { ignoreError: true });
  }
}

async function serializeBrunoCookies(): Promise<NonNullable<ApiClientRuntimeResult['cookies']>> {
  const serialized = await brunoCookies.cookieJar.serialize();
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

async function withBrunoCookieJar<T>(context: ApiClientScriptContext, operation: () => Promise<T>): Promise<T> {
  if (cookieExecution.getStore()) return operation();
  let release!: () => void;
  const previous = cookieQueue;
  cookieQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    await replaceBrunoCookies(context);
    return await cookieExecution.run(true, operation);
  } finally {
    release();
  }
}

function internalResponse(response: NonNullable<ApiClientScriptContext['response']>, request: ApiClientRequestInput) {
  let data: unknown = response.body;
  if (/json/i.test(response.contentType)) {
    try { data = JSON.parse(response.body); } catch { /* Keep malformed JSON visible as text. */ }
  }
  let protocol = '';
  let host = '';
  let path = request.url;
  try {
    const url = new URL(request.url);
    protocol = `${url.protocol}//`;
    host = url.host;
    path = `${url.pathname}${url.search}`;
  } catch {
    // gRPC targets and partially edited URLs are still exposed to scripts.
  }
  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    data,
    dataBuffer: Buffer.from(response.body),
    responseTime: response.durationMs,
    request: { protocol, host, path },
  };
}

function updateRequest(request: ApiClientRequestInput, scripted: any): ApiClientRequestInput {
  const previousByName = new Map(request.headers.map((header) => [header.name.toLowerCase(), header]));
  const headers = Object.entries(scripted.headers ?? {}).map(([name, value], index) => ({
    id: previousByName.get(name.toLowerCase())?.id ?? `script-header-${index}`,
    name,
    value: Array.isArray(value) ? value.join(', ') : String(value ?? ''),
    enabled: true,
  }));
  return {
    ...request,
    url: String(scripted.url ?? request.url),
    method: String(scripted.method ?? request.method).toUpperCase() as ApiClientRequestInput['method'],
    headers,
    body: typeof scripted.data === 'string' ? scripted.data : JSON.stringify(scripted.data ?? ''),
    timeoutMs: Number.isFinite(Number(scripted.timeout)) ? Number(scripted.timeout) : request.timeoutMs,
  };
}

function updateResponse(original: NonNullable<ApiClientScriptContext['response']>, scripted: any) {
  const body = typeof scripted.data === 'string' ? scripted.data : JSON.stringify(scripted.data ?? '');
  return {
    ...original,
    status: Number(scripted.status ?? original.status),
    statusText: String(scripted.statusText ?? original.statusText),
    headers: Object.fromEntries(Object.entries(scripted.headers ?? original.headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value ?? '')])),
    body,
    size: Buffer.byteLength(body),
  };
}

function mapTests(results: any[]): ApiClientScriptTest[] {
  return (Array.isArray(results) ? results : []).map((result, index) => ({
    id: String(result.uid ?? `bruno-test-${index}`),
    label: String(
      result.description
      ?? result.name
      ?? ([result.lhsExpr, result.operator, result.rhsExpr].filter((part) => part !== undefined && part !== null && part !== '').join(' ') || `Test ${index + 1}`),
    ),
    passed: result.status === 'pass' || result.passed === true,
    actual: String(result.error ?? result.message ?? ''),
    expected: '',
  }));
}

function mapVisualizations(values: any[]): ApiClientScriptVisualization[] {
  return (Array.isArray(values) ? values : []).flatMap((value) => {
    if (value?.type === 'html') return [{ type: 'html' as const, content: String(value.data?.content ?? ''), data: value.data?.rawData }];
    if (value?.type === 'table') return [{ type: 'table' as const, content: '', data: value.data }];
    return [];
  });
}

function logsSink(logs: string[]) {
  return (level: string, values: unknown[]) => {
    const text = values.map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join(' ');
    logs.push(`${level === 'log' ? '' : `[${level}] `}${text}`.slice(0, 20_000));
  };
}

function replaceScope(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

function resultScopes(context: ApiClientScriptContext, result: any) {
  return mergeScriptScopes({
    ...context.scopes,
    environment: result.envVariables ?? context.scopes.environment,
    runtime: result.runtimeVariables ?? context.scopes.runtime,
    collection: result.collectionVariables ?? context.scopes.collection,
    globals: result.globalEnvironmentVariables ?? context.scopes.globals,
  });
}

function runRequestBridge(context: ApiClientScriptContext) {
  if (!context.runRequest) return undefined;
  return async (reference: string) => {
    const result = await context.runRequest!(reference);
    replaceScope(context.scopes.collection, result.scopes.collection);
    replaceScope(context.scopes.environment, result.scopes.environment);
    replaceScope(context.scopes.globals, result.scopes.globals);
    replaceScope(context.scopes.runtime, result.scopes.runtime);
    if (!result.response) return null;
    return internalResponse(result.response, result.request);
  };
}

function runtimeArguments(context: ApiClientScriptContext, logs: string[]) {
  const collectionPath = context.collectionPath ?? process.cwd();
  return {
    collectionPath,
    common: [
      context.scopes.environment,
      context.scopes.runtime,
      collectionPath,
      logsSink(logs),
      {},
      {},
      null,
      Object.fromEntries(Object.entries(context.secrets ?? {}).map(([key, value]) => [`$secrets.${key}`, value])),
      runRequestBridge(context),
      context.collectionName,
    ],
  };
}

function networkConfig(context: ApiClientScriptContext) {
  const proxy = context.network.proxyUrl.trim() ? new URL(context.network.proxyUrl.trim()) : null;
  return {
    collectionPath: context.collectionPath ?? process.cwd(),
    options: {
      noproxy: !proxy,
      shouldVerifyTls: context.network.rejectUnauthorized,
      shouldUseCustomCaCertificate: Boolean(context.network.caPath),
      customCaCertificateFilePath: context.network.caPath || undefined,
      shouldKeepDefaultCaCertificates: true,
    },
    clientCertificates: {
      certs: context.network.clientPfxPath
        ? [{ domain: '*', type: 'pfx', pfxFilePath: context.network.clientPfxPath, passphrase: context.network.clientKeyPassphrase }]
        : context.network.clientCertificatePath && context.network.clientKeyPath
          ? [{ domain: '*', type: 'cert', certFilePath: context.network.clientCertificatePath, keyFilePath: context.network.clientKeyPath, passphrase: context.network.clientKeyPassphrase }]
          : [],
    },
    collectionLevelProxy: proxy ? {
      enabled: true,
      mode: 'on',
      protocol: proxy.protocol.replace(':', ''),
      hostname: proxy.hostname,
      port: Number(proxy.port || (proxy.protocol === 'https:' ? 443 : 80)),
      auth: proxy.username ? { enabled: true, username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) } : { enabled: false },
    } : undefined,
  };
}

async function executeBrunoScript(context: ApiClientScriptContext): Promise<ApiClientRuntimeResult> {
  if (!context.script.trim()) {
    return { request: structuredClone(context.request), response: context.response, scopes: mergeScriptScopes(context.scopes), logs: [], tests: [], flow: emptyScriptFlow(), visualizations: [], cookies: context.network.cookies };
  }
  const runtime = new ScriptRuntime({ runtime: 'quickjs' });
  const request = internalRequest(context);
  const logs: string[] = [];
  const { common } = runtimeArguments(context, logs);

  try {
    const result = context.response
      ? await runtime.runResponseScript(context.script, request, internalResponse(context.response, context.request), ...common)
      : await runtime.runRequestScript(context.script, request, ...common);
    const scopes = resultScopes(context, result);
    return {
      request: updateRequest(context.request, result.request ?? request),
      response: context.response ? updateResponse(context.response, result.response ?? internalResponse(context.response, context.request)) : undefined,
      scopes,
      logs: logs.slice(0, 200),
      tests: mapTests(result.results).slice(0, 300),
      flow: {
        nextRequest: result.nextRequestName,
        skipRequest: Boolean(result.skipRequest),
        stopExecution: Boolean(result.stopExecution),
      },
      visualizations: mapVisualizations(result.visualizations).slice(0, 20),
      cookies: await serializeBrunoCookies(),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ApiClientScriptExecutionError(context.stage, detail);
  }
}

export async function runBrunoScript(context: ApiClientScriptContext): Promise<ApiClientRuntimeResult> {
  return withBrunoCookieJar(context, () => executeBrunoScript(context));
}

async function executeBrunoTests(context: ApiClientScriptContext): Promise<ApiClientRuntimeResult> {
  if (!context.script.trim() || !context.response) {
    return { request: structuredClone(context.request), response: context.response, scopes: mergeScriptScopes(context.scopes), logs: [], tests: [], flow: emptyScriptFlow(), visualizations: [], cookies: context.network.cookies };
  }
  const logs: string[] = [];
  const request = internalRequest(context);
  const { common } = runtimeArguments(context, logs);
  try {
    const result = await new TestRuntime({ runtime: 'quickjs' }).runTests(
      context.script,
      request,
      internalResponse(context.response, context.request),
      ...common,
    );
    const scopes = resultScopes(context, result);
    return {
      request: updateRequest(context.request, result.request ?? request),
      response: context.response,
      scopes,
      logs: logs.slice(0, 200),
      tests: mapTests(result.results).slice(0, 300),
      flow: { nextRequest: result.nextRequestName, skipRequest: false, stopExecution: false },
      visualizations: [],
      cookies: await serializeBrunoCookies(),
    };
  } catch (error) {
    throw new ApiClientScriptExecutionError(context.stage, error instanceof Error ? error.message : String(error));
  }
}

export async function runBrunoTests(context: ApiClientScriptContext): Promise<ApiClientRuntimeResult> {
  return withBrunoCookieJar(context, () => executeBrunoTests(context));
}

export function runBrunoAssertions(context: ApiClientScriptContext, assertions: any[]): ApiClientScriptTest[] {
  if (!context.response || !assertions.length) return [];
  try {
    const result = new AssertRuntime({ runtime: 'quickjs' }).runAssertions(
      assertions,
      internalRequest(context),
      internalResponse(context.response, context.request),
      context.scopes.environment,
      context.scopes.runtime,
      {},
      null,
      Object.fromEntries(Object.entries(context.secrets ?? {}).map(([key, value]) => [`$secrets.${key}`, value])),
    );
    return mapTests(result).slice(0, 300);
  } catch (error) {
    throw new ApiClientScriptExecutionError(context.stage, error instanceof Error ? error.message : String(error));
  }
}

export function runBrunoPostResponseVariables(context: ApiClientScriptContext, values: any[]): ApiClientScriptScopes {
  if (!context.response || !values.length) return mergeScriptScopes(context.scopes);
  try {
    const result = new VarsRuntime({ runtime: 'quickjs' }).runPostResponseVars(
      values,
      internalRequest(context),
      internalResponse(context.response, context.request),
      context.scopes.environment,
      context.scopes.runtime,
      context.collectionPath ?? process.cwd(),
      {},
      null,
      Object.fromEntries(Object.entries(context.secrets ?? {}).map(([key, value]) => [`$secrets.${key}`, value])),
    );
    if (result?.error) throw new Error(result.error);
    return resultScopes(context, result ?? {});
  } catch (error) {
    throw new ApiClientScriptExecutionError(context.stage, error instanceof Error ? error.message : String(error));
  }
}
