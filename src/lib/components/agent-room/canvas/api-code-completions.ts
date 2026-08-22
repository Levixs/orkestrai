import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { javascriptLanguage } from '@codemirror/lang-javascript';

export type ApiCodeCompletionProfile = 'none' | 'orkestrai' | 'postman' | 'bruno';

type Entry = {
  label: string;
  snippet?: string;
  detail?: string;
  type?: Completion['type'];
};

const variableScope: Entry[] = [
  { label: 'get', snippet: 'get(${name})', detail: '(name)', type: 'method' },
  { label: 'has', snippet: 'has(${name})', detail: '(name)', type: 'method' },
  { label: 'set', snippet: 'set(${name}, ${value})', detail: '(name, value)', type: 'method' },
  { label: 'unset', snippet: 'unset(${name})', detail: '(name)', type: 'method' },
  { label: 'clear', snippet: 'clear()', detail: '()', type: 'method' },
  { label: 'replaceIn', snippet: 'replaceIn(${value})', detail: '(value)', type: 'method' },
  { label: 'toObject', snippet: 'toObject()', detail: '()', type: 'method' },
];

const members: Record<string, Entry[]> = {
  bru: [
    { label: 'cwd', snippet: 'cwd()', detail: '()', type: 'method' },
    { label: 'getEnvName', snippet: 'getEnvName()', detail: '()', type: 'method' },
    { label: 'getCollectionName', snippet: 'getCollectionName()', detail: '()', type: 'method' },
    { label: 'isSafeMode', snippet: 'isSafeMode()', detail: '()', type: 'method' },
    { label: 'interpolate', snippet: 'interpolate(${value})', detail: '(value)', type: 'method' },
    { label: 'getProcessEnv', snippet: 'getProcessEnv(${name})', detail: '(name)', type: 'method' },
    { label: 'getSecretVar', snippet: 'getSecretVar(${name})', detail: '(name)', type: 'method' },
    { label: 'hasVar', snippet: 'hasVar(${name})', detail: '(name)', type: 'method' },
    { label: 'getVar', snippet: 'getVar(${name})', detail: '(name)', type: 'method' },
    { label: 'setVar', snippet: 'setVar(${name}, ${value})', detail: '(name, value)', type: 'method' },
    { label: 'deleteVar', snippet: 'deleteVar(${name})', detail: '(name)', type: 'method' },
    { label: 'getAllVars', snippet: 'getAllVars()', detail: '()', type: 'method' },
    { label: 'deleteAllVars', snippet: 'deleteAllVars()', detail: '()', type: 'method' },
    { label: 'hasEnvVar', snippet: 'hasEnvVar(${name})', detail: '(name)', type: 'method' },
    { label: 'getEnvVar', snippet: 'getEnvVar(${name})', detail: '(name)', type: 'method' },
    { label: 'setEnvVar', snippet: 'setEnvVar(${name}, ${value})', detail: '(name, value)', type: 'method' },
    { label: 'deleteEnvVar', snippet: 'deleteEnvVar(${name})', detail: '(name)', type: 'method' },
    { label: 'getAllEnvVars', snippet: 'getAllEnvVars()', detail: '()', type: 'method' },
    { label: 'deleteAllEnvVars', snippet: 'deleteAllEnvVars()', detail: '()', type: 'method' },
    { label: 'hasGlobalEnvVar', snippet: 'hasGlobalEnvVar(${name})', detail: '(name)', type: 'method' },
    { label: 'getGlobalEnvVar', snippet: 'getGlobalEnvVar(${name})', detail: '(name)', type: 'method' },
    { label: 'setGlobalEnvVar', snippet: 'setGlobalEnvVar(${name}, ${value})', detail: '(name, value)', type: 'method' },
    { label: 'deleteGlobalEnvVar', snippet: 'deleteGlobalEnvVar(${name})', detail: '(name)', type: 'method' },
    { label: 'getAllGlobalEnvVars', snippet: 'getAllGlobalEnvVars()', detail: '()', type: 'method' },
    { label: 'deleteAllGlobalEnvVars', snippet: 'deleteAllGlobalEnvVars()', detail: '()', type: 'method' },
    { label: 'hasCollectionVar', snippet: 'hasCollectionVar(${name})', detail: '(name)', type: 'method' },
    { label: 'getCollectionVar', snippet: 'getCollectionVar(${name})', detail: '(name)', type: 'method' },
    { label: 'setCollectionVar', snippet: 'setCollectionVar(${name}, ${value})', detail: '(name, value)', type: 'method' },
    { label: 'deleteCollectionVar', snippet: 'deleteCollectionVar(${name})', detail: '(name)', type: 'method' },
    { label: 'getAllCollectionVars', snippet: 'getAllCollectionVars()', detail: '()', type: 'method' },
    { label: 'deleteAllCollectionVars', snippet: 'deleteAllCollectionVars()', detail: '()', type: 'method' },
    { label: 'getFolderVar', snippet: 'getFolderVar(${name})', detail: '(name)', type: 'method' },
    { label: 'getRequestVar', snippet: 'getRequestVar(${name})', detail: '(name)', type: 'method' },
    { label: 'getOauth2CredentialVar', snippet: 'getOauth2CredentialVar(${name})', detail: '(name)', type: 'method' },
    { label: 'resetOauth2Credential', snippet: 'resetOauth2Credential(${credentialId})', detail: '(credentialId)', type: 'method' },
    { label: 'sendRequest', snippet: 'sendRequest({\n  url: ${url},\n  method: ${method}\n})', detail: '(config, callback?)', type: 'method' },
    { label: 'runRequest', snippet: 'runRequest(${requestName})', detail: '(requestName)', type: 'method' },
    { label: 'setNextRequest', snippet: 'setNextRequest(${requestName})', detail: '(requestName)', type: 'method' },
    { label: 'sleep', snippet: 'sleep(${milliseconds})', detail: '(milliseconds)', type: 'method' },
    { label: 'visualize', snippet: 'visualize(${type}, ${data})', detail: '(type, data)', type: 'method' },
    { label: 'clearVisualizations', snippet: 'clearVisualizations()', detail: '()', type: 'method' },
    { label: 'getTestResults', snippet: 'getTestResults()', detail: '()', type: 'method' },
    { label: 'getAssertionResults', snippet: 'getAssertionResults()', detail: '()', type: 'method' },
    { label: 'cookies', detail: 'CookieList', type: 'property' },
    { label: 'runner', detail: 'Runner', type: 'property' },
    { label: 'utils', detail: 'Utilities', type: 'property' },
  ],
  'bru.runner': [
    { label: 'skipRequest', snippet: 'skipRequest()', detail: '()', type: 'method' },
    { label: 'stopExecution', snippet: 'stopExecution()', detail: '()', type: 'method' },
    { label: 'setNextRequest', snippet: 'setNextRequest(${requestName})', detail: '(requestName)', type: 'method' },
    { label: 'iterationIndex', detail: 'number', type: 'property' },
    { label: 'totalIterations', detail: 'number', type: 'property' },
    { label: 'iterationData', detail: 'VariableScope', type: 'property' },
  ],
  'bru.runner.iterationData': variableScope,
  'bru.cookies': [
    { label: 'get', snippet: 'get(${name})', detail: '(name)', type: 'method' },
    { label: 'has', snippet: 'has(${name})', detail: '(name)', type: 'method' },
    { label: 'add', snippet: 'add(${cookie})', detail: '(cookie)', type: 'method' },
    { label: 'upsert', snippet: 'upsert(${cookie})', detail: '(cookie)', type: 'method' },
    { label: 'remove', snippet: 'remove(${name})', detail: '(name)', type: 'method' },
    { label: 'clear', snippet: 'clear()', detail: '()', type: 'method' },
    { label: 'toObject', snippet: 'toObject()', detail: '()', type: 'method' },
    { label: 'jar', snippet: 'jar()', detail: '()', type: 'method' },
  ],
  'bru.utils': [
    { label: 'minifyJson', snippet: 'minifyJson(${value})', detail: '(value)', type: 'method' },
    { label: 'minifyXml', snippet: 'minifyXml(${value})', detail: '(value)', type: 'method' },
  ],
  req: [
    { label: 'url', detail: 'string', type: 'property' },
    { label: 'method', detail: 'string', type: 'property' },
    { label: 'headers', detail: 'object', type: 'property' },
    { label: 'body', detail: 'unknown', type: 'property' },
    { label: 'timeout', detail: 'number', type: 'property' },
    { label: 'getUrl', snippet: 'getUrl()', detail: '()', type: 'method' },
    { label: 'setUrl', snippet: 'setUrl(${url})', detail: '(url)', type: 'method' },
    { label: 'getHost', snippet: 'getHost()', detail: '()', type: 'method' },
    { label: 'getPath', snippet: 'getPath()', detail: '()', type: 'method' },
    { label: 'getQueryString', snippet: 'getQueryString()', detail: '()', type: 'method' },
    { label: 'getMethod', snippet: 'getMethod()', detail: '()', type: 'method' },
    { label: 'setMethod', snippet: 'setMethod(${method})', detail: '(method)', type: 'method' },
    { label: 'getAuthMode', snippet: 'getAuthMode()', detail: '()', type: 'method' },
    { label: 'getHeaders', snippet: 'getHeaders()', detail: '()', type: 'method' },
    { label: 'setHeaders', snippet: 'setHeaders(${headers})', detail: '(headers)', type: 'method' },
    { label: 'getHeader', snippet: 'getHeader(${name})', detail: '(name)', type: 'method' },
    { label: 'setHeader', snippet: 'setHeader(${name}, ${value})', detail: '(name, value)', type: 'method' },
    { label: 'deleteHeader', snippet: 'deleteHeader(${name})', detail: '(name)', type: 'method' },
    { label: 'deleteHeaders', snippet: 'deleteHeaders(${names})', detail: '(names)', type: 'method' },
    { label: 'getBody', snippet: 'getBody()', detail: '(options?)', type: 'method' },
    { label: 'setBody', snippet: 'setBody(${body})', detail: '(body, options?)', type: 'method' },
    { label: 'getTimeout', snippet: 'getTimeout()', detail: '()', type: 'method' },
    { label: 'setTimeout', snippet: 'setTimeout(${milliseconds})', detail: '(milliseconds)', type: 'method' },
  ],
  res: [
    { label: 'status', detail: 'number', type: 'property' },
    { label: 'statusText', detail: 'string', type: 'property' },
    { label: 'headers', detail: 'object', type: 'property' },
    { label: 'body', detail: 'unknown', type: 'property' },
    { label: 'responseTime', detail: 'number', type: 'property' },
    { label: 'url', detail: 'string', type: 'property' },
    { label: 'getStatus', snippet: 'getStatus()', detail: '()', type: 'method' },
    { label: 'getStatusText', snippet: 'getStatusText()', detail: '()', type: 'method' },
    { label: 'getHeader', snippet: 'getHeader(${name})', detail: '(name)', type: 'method' },
    { label: 'getHeaders', snippet: 'getHeaders()', detail: '()', type: 'method' },
    { label: 'getBody', snippet: 'getBody()', detail: '()', type: 'method' },
    { label: 'setBody', snippet: 'setBody(${body})', detail: '(body)', type: 'method' },
    { label: 'getResponseTime', snippet: 'getResponseTime()', detail: '()', type: 'method' },
    { label: 'getUrl', snippet: 'getUrl()', detail: '()', type: 'method' },
    { label: 'getSize', snippet: 'getSize()', detail: '()', type: 'method' },
  ],
  pm: [
    { label: 'test', snippet: 'test(${name}, () => {\n  ${}\n})', detail: '(name, callback)', type: 'method' },
    { label: 'expect', snippet: 'expect(${actual})', detail: '(actual)', type: 'method' },
    { label: 'sendRequest', snippet: 'sendRequest(${request}, ${callback})', detail: '(request, callback?)', type: 'method' },
    { label: 'require', snippet: 'require(${packageName})', detail: '(packageName)', type: 'method' },
    { label: 'variables', detail: 'VariableScope', type: 'property' },
    { label: 'environment', detail: 'VariableScope', type: 'property' },
    { label: 'collectionVariables', detail: 'VariableScope', type: 'property' },
    { label: 'globals', detail: 'VariableScope', type: 'property' },
    { label: 'iterationData', detail: 'VariableScope', type: 'property' },
    { label: 'vault', detail: 'VariableScope', type: 'property' },
    { label: 'execution', detail: 'Execution', type: 'property' },
    { label: 'request', detail: 'Request', type: 'property' },
    { label: 'response', detail: 'Response', type: 'property' },
    { label: 'cookies', detail: 'CookieList', type: 'property' },
    { label: 'visualizer', detail: 'Visualizer', type: 'property' },
    { label: 'info', detail: 'Script metadata', type: 'property' },
  ],
  'pm.variables': variableScope,
  'pm.environment': variableScope,
  'pm.collectionVariables': variableScope,
  'pm.globals': variableScope,
  'pm.iterationData': variableScope,
  'pm.vault': variableScope,
  'pm.execution': [
    { label: 'runRequest', snippet: 'runRequest(${requestId})', detail: '(requestId)', type: 'method' },
    { label: 'setNextRequest', snippet: 'setNextRequest(${requestName})', detail: '(requestName)', type: 'method' },
    { label: 'skipRequest', snippet: 'skipRequest()', detail: '()', type: 'method' },
  ],
  'pm.response': [
    { label: 'code', detail: 'number', type: 'property' },
    { label: 'status', detail: 'string', type: 'property' },
    { label: 'responseTime', detail: 'number', type: 'property' },
    { label: 'json', snippet: 'json()', detail: '()', type: 'method' },
    { label: 'text', snippet: 'text()', detail: '()', type: 'method' },
    { label: 'headers', detail: 'HeaderList', type: 'property' },
  ],
  'pm.request': [
    { label: 'method', detail: 'string', type: 'property' },
    { label: 'url', detail: 'Url', type: 'property' },
    { label: 'headers', detail: 'HeaderList', type: 'property' },
    { label: 'body', detail: 'RequestBody', type: 'property' },
  ],
  'pm.request.headers': [
    { label: 'get', snippet: 'get(${name})', detail: '(name)', type: 'method' },
    { label: 'add', snippet: 'add({ key: ${name}, value: ${value} })', detail: '({ key, value })', type: 'method' },
    { label: 'upsert', snippet: 'upsert({ key: ${name}, value: ${value} })', detail: '({ key, value })', type: 'method' },
    { label: 'remove', snippet: 'remove(${name})', detail: '(name)', type: 'method' },
  ],
  'pm.visualizer': [
    { label: 'set', snippet: 'set(${template}, ${data})', detail: '(template, data, options?)', type: 'method' },
    { label: 'clear', snippet: 'clear()', detail: '()', type: 'method' },
  ],
  console: [
    { label: 'log', snippet: 'log(${value})', detail: '(value)', type: 'method' },
    { label: 'info', snippet: 'info(${value})', detail: '(value)', type: 'method' },
    { label: 'warn', snippet: 'warn(${value})', detail: '(value)', type: 'method' },
    { label: 'error', snippet: 'error(${value})', detail: '(value)', type: 'method' },
  ],
};

const roots: Record<Exclude<ApiCodeCompletionProfile, 'none'>, Entry[]> = {
  bruno: [
    { label: 'bru', detail: 'Bruno API', type: 'variable' },
    { label: 'req', detail: 'BrunoRequest', type: 'variable' },
    { label: 'res', detail: 'BrunoResponse', type: 'variable' },
    { label: 'test', snippet: 'test(${name}, () => {\n  ${}\n})', detail: '(name, callback)', type: 'function' },
    { label: 'expect', snippet: 'expect(${actual})', detail: '(actual)', type: 'function' },
    { label: 'assert', snippet: 'assert(${actual})', detail: '(actual)', type: 'function' },
  ],
  postman: [
    { label: 'pm', detail: 'Postman API', type: 'variable' },
  ],
  orkestrai: [
    { label: 'bru', detail: 'Orkestrai compatibility API', type: 'variable' },
    { label: 'req', detail: 'Request', type: 'variable' },
    { label: 'res', detail: 'Response', type: 'variable' },
    { label: 'pm', detail: 'Orkestrai compatibility API', type: 'variable' },
    { label: 'test', snippet: 'test(${name}, () => {\n  ${}\n})', detail: '(name, callback)', type: 'function' },
    { label: 'expect', snippet: 'expect(${actual})', detail: '(actual)', type: 'function' },
  ],
};

function completion(entry: Entry): Completion {
  const base: Completion = { label: entry.label, detail: entry.detail, type: entry.type };
  return entry.snippet ? snippetCompletion(entry.snippet, base) : base;
}

export function apiClientCompletionOptions(profile: ApiCodeCompletionProfile, path: string | null): Completion[] {
  if (profile === 'none') return [];
  if (path) {
    const allowed = profile === 'postman'
      ? path === 'console' || path.startsWith('pm')
      : profile === 'bruno'
        ? path === 'console' || path === 'req' || path === 'res' || path.startsWith('bru')
        : true;
    if (!allowed) return [];
    const entries = members[path] ?? [];
    if (profile !== 'orkestrai') return entries.map(completion);
    const nativeBru = new Set(['getVar', 'hasVar', 'setVar', 'deleteVar', 'getAllVars']);
    const nativePm = new Set(['test', 'expect', 'variables', 'environment', 'collectionVariables', 'request', 'response']);
    if (path === 'bru') return entries.filter((entry) => nativeBru.has(entry.label)).map(completion);
    if (path === 'pm') return entries.filter((entry) => nativePm.has(entry.label)).map(completion);
    if (path.startsWith('bru.')) return [];
    if (path.startsWith('pm.') && !['pm.variables', 'pm.environment', 'pm.collectionVariables', 'pm.request', 'pm.request.headers', 'pm.response'].includes(path)) return [];
    return entries.map(completion);
  }
  return [...roots[profile], { label: 'console', detail: 'Console', type: 'variable' }].map(completion);
}

function source(profile: ApiCodeCompletionProfile) {
  return (context: CompletionContext): CompletionResult | null => {
    const chain = context.matchBefore(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.?/);
    if (!chain) return null;
    const dot = chain.text.lastIndexOf('.');
    if (dot >= 0) {
      const path = chain.text.slice(0, dot);
      const options = apiClientCompletionOptions(profile, path);
      return options.length ? { from: chain.from + dot + 1, options, validFor: /^[\w$]*$/ } : null;
    }
    if (!context.explicit && !chain.text) return null;
    return { from: chain.from, options: apiClientCompletionOptions(profile, null), validFor: /^[\w$]*$/ };
  };
}

export function apiClientCompletionExtension(profile: ApiCodeCompletionProfile) {
  return profile === 'none' ? [] : javascriptLanguage.data.of({ autocomplete: source(profile) });
}
