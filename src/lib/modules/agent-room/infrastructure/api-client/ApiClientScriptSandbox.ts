import { getQuickJS, shouldInterruptAfterDeadline } from 'quickjs-emscripten';
import type { ApiClientRequestInput } from '../../contracts/schemas/apiClient.schema.js';

const SCRIPT_TIMEOUT_MS = 750;
const SCRIPT_MEMORY_BYTES = 12 * 1024 * 1024;

export type ApiClientScriptStage =
  | 'collectionPreRequest'
  | 'folderPreRequest'
  | 'requestPreRequest'
  | 'requestPostResponse'
  | 'folderPostResponse'
  | 'collectionPostResponse';

export class ApiClientScriptExecutionError extends Error {
  readonly code = 'api_client_script_failed';

  constructor(
    readonly stage: ApiClientScriptStage,
    readonly detail: string,
    readonly lineNumber: number | null = null,
  ) {
    super(detail);
    this.name = 'ApiClientScriptExecutionError';
  }
}

export type ApiClientScriptResponse = {
  status: number;
  statusText: string;
  ok: boolean;
  durationMs: number;
  size: number;
  contentType: string;
  headers: Record<string, string>;
  body: string;
  binary: boolean;
};

export type ApiClientScriptResult = {
  request: ApiClientRequestInput;
  variables: Record<string, string>;
  logs: string[];
  tests: Array<{ id: string; label: string; passed: boolean; actual: string; expected: string }>;
};

function scriptProgram(
  script: string,
  request: ApiClientRequestInput,
  variables: Record<string, string>,
  response?: ApiClientScriptResponse,
): { source: string; userStartLine: number; userLineCount: number } {
  const state = JSON.stringify({ request, variables, response: response ?? null });
  const prefix = `
    "use strict";
    const __state = ${state};
    const request = __state.request;
    const variables = __state.variables;
    const response = __state.response;
    const __logs = [];
    const __tests = [];
    const __text = (value) => typeof value === "string" ? value : JSON.stringify(value);
    const console = {
      log: (...values) => __logs.push(values.map(__text).join(" ")),
      info: (...values) => __logs.push(values.map(__text).join(" ")),
      warn: (...values) => __logs.push(values.map(__text).join(" ")),
      error: (...values) => __logs.push(values.map(__text).join(" ")),
    };
    const bru = {
      getVar: (name) => variables[String(name)],
      hasVar: (name) => Object.prototype.hasOwnProperty.call(variables, String(name)),
      setVar: (name, value) => { variables[String(name)] = String(value); },
      deleteVar: (name) => { delete variables[String(name)]; },
      getAllVars: () => ({ ...variables }),
    };
    const req = {
      getUrl: () => request.url,
      setUrl: (value) => { request.url = String(value); },
      getBody: () => request.body,
      setBody: (value) => { request.body = typeof value === "string" ? value : JSON.stringify(value); },
      getHeader: (name) => request.headers.find((header) => header.name.toLowerCase() === String(name).toLowerCase())?.value,
      setHeader: (name, value) => {
        const key = String(name);
        const existing = request.headers.find((header) => header.name.toLowerCase() === key.toLowerCase());
        if (existing) { existing.value = String(value); existing.enabled = true; }
        else request.headers.push({ id: "script-" + request.headers.length, name: key, value: String(value), enabled: true });
      },
      removeHeader: (name) => {
        const key = String(name).toLowerCase();
        request.headers = request.headers.filter((header) => header.name.toLowerCase() !== key);
      },
    };
    const res = response ? {
      ...response,
      getStatus: () => response.status,
      getStatusText: () => response.statusText,
      getHeader: (name) => response.headers?.[String(name).toLowerCase()],
      getHeaders: () => ({ ...response.headers }),
      getBody: () => {
        try { return JSON.parse(response.body); } catch { return response.body; }
      },
      getResponseTime: () => response.durationMs,
      getUrl: () => request.url,
      getSize: () => response.size,
    } : null;
    const __variableScope = {
      get: (name) => variables[String(name)],
      has: (name) => Object.prototype.hasOwnProperty.call(variables, String(name)),
      set: (name, value) => { variables[String(name)] = String(value); },
      unset: (name) => { delete variables[String(name)]; },
      replaceIn: (value) => String(value).replace(/{{\\s*([^{}]+?)\\s*}}/g, (match, name) => Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match),
      toObject: () => ({ ...variables }),
    };
    const __expect = (actual) => {
      const fail = (expected) => { throw new Error("Expected " + __text(actual) + " to match " + __text(expected)); };
      const to = {
        equal: (expected) => { if (actual !== expected) fail(expected); },
        eql: (expected) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(expected); },
        include: (expected) => { if (!String(actual).includes(String(expected))) fail(expected); },
        above: (expected) => { if (!(Number(actual) > Number(expected))) fail(expected); },
        below: (expected) => { if (!(Number(actual) < Number(expected))) fail(expected); },
        oneOf: (expected) => { if (!Array.isArray(expected) || !expected.includes(actual)) fail(expected); },
      };
      to.be = to;
      to.have = {
        property: function (name, expected) {
          if (actual === null || typeof actual !== "object" || !(name in actual)) fail(name);
          if (arguments.length > 1 && actual[name] !== expected) fail(expected);
        },
      };
      return { to };
    };
    const pm = {
      variables: __variableScope,
      environment: __variableScope,
      collectionVariables: __variableScope,
      request: {
        url: {
          toString: () => request.url,
          query: { add: ({ key, value }) => request.params.push({ id: "script-param-" + request.params.length, name: String(key), value: String(value), enabled: true }) },
        },
        headers: {
          get: (name) => req.getHeader(name),
          add: ({ key, value }) => req.setHeader(key, value),
          upsert: ({ key, value }) => req.setHeader(key, value),
          remove: (name) => req.removeHeader(name),
        },
        body: { toString: () => request.body },
      },
      response: {
        code: response?.status,
        status: response?.statusText,
        responseTime: response?.durationMs,
        text: () => response?.body ?? "",
        json: () => JSON.parse(response?.body ?? ""),
        headers: { get: (name) => response?.headers?.[String(name).toLowerCase()] },
        to: { have: { status: (expected) => { if (response?.status !== expected) throw new Error("Expected status " + expected + ", received " + response?.status); } } },
      },
      expect: __expect,
      test: (name, callback) => {
        try {
          callback();
          __tests.push({ id: "script-test-" + __tests.length, label: String(name), passed: true, actual: "", expected: "" });
        } catch (error) {
          __tests.push({ id: "script-test-" + __tests.length, label: String(name), passed: false, actual: String(error?.message ?? error), expected: "" });
        }
      },
    };
    const expect = __expect;
    const test = pm.test;
    (() => {
`;
  const suffix = `
    })();
    JSON.stringify({ request, variables, logs: __logs.slice(0, 200), tests: __tests.slice(0, 300) });
  `;
  return {
    source: `${prefix}${script}${suffix}`,
    userStartLine: prefix.split('\n').length,
    userLineCount: script.split(/\r?\n/).length,
  };
}

function quickJsError(error: unknown, program: ReturnType<typeof scriptProgram>) {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  const name = typeof value?.name === 'string' && value.name.trim() ? value.name.trim() : 'ScriptError';
  const message = typeof value?.message === 'string' && value.message.trim()
    ? value.message.trim()
    : typeof error === 'string' && error.trim()
      ? error.trim()
      : 'The script could not be evaluated.';
  const engineLine = typeof value?.lineNumber === 'number' && Number.isFinite(value.lineNumber)
    ? Math.trunc(value.lineNumber)
    : null;
  const lineNumber = engineLine === null
    ? null
    : Math.min(program.userLineCount, Math.max(1, engineLine - program.userStartLine + 1));
  return { detail: `${name}: ${message}`, lineNumber };
}

export async function runApiClientScript(input: {
  script: string;
  request: ApiClientRequestInput;
  variables: Record<string, string>;
  response?: ApiClientScriptResponse;
  stage?: ApiClientScriptStage;
}): Promise<ApiClientScriptResult> {
  if (!input.script.trim()) {
    return {
      request: structuredClone(input.request),
      variables: { ...input.variables },
      logs: [],
      tests: [],
    };
  }

  const QuickJS = await getQuickJS();
  const program = scriptProgram(input.script, structuredClone(input.request), { ...input.variables }, input.response);
  let result: unknown;
  try {
    result = QuickJS.evalCode(program.source, {
      memoryLimitBytes: SCRIPT_MEMORY_BYTES,
      maxStackSizeBytes: 512 * 1024,
      shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + SCRIPT_TIMEOUT_MS),
    });
  } catch (error) {
    const normalized = quickJsError(error, program);
    throw new ApiClientScriptExecutionError(input.stage ?? 'requestPreRequest', normalized.detail, normalized.lineNumber);
  }
  if (typeof result !== 'string') throw new Error('The API script returned an invalid result.');
  const parsed = JSON.parse(result) as ApiClientScriptResult;
  return {
    request: parsed.request,
    variables: Object.fromEntries(Object.entries(parsed.variables ?? {}).map(([key, value]) => [key, String(value)])),
    logs: Array.isArray(parsed.logs) ? parsed.logs.map(String).slice(0, 200) : [],
    tests: Array.isArray(parsed.tests) ? parsed.tests.slice(0, 300) : [],
  };
}
