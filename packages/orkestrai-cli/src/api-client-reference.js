export function apiClientReference() {
  return {
    workflow: [
      'Call api_client_list, then api_client_read before changing an existing collection.',
      'Edit the returned collection and pass its fingerprint to api_client_replace. A stale fingerprint is rejected instead of overwriting concurrent UI changes.',
      'Use stable unique ids for requests, folders, runners, params, headers, form fields, assertions, and messages.',
      'Secrets are returned as __ORKESTRAI_REDACTED__. Keep that exact value to preserve the stored secret, or provide a replacement value.',
      'Set scriptDialect to bruno, postman, or orkestrai and write scripts for that runtime. Scripts are preserved on export; JavaScript is never silently translated between runtimes.',
      'Use api_client_export with the matching kind after validating requests and runner results.',
    ],
    collection: {
      requests: 'Array of complete request objects.',
      folders: 'Array of { id, name, parentId, sequence }; requests reference folders with folderId.',
      runners: 'Array of { id, name, requestIds, environment, iterations, iterationData, delayMs, stopOnFailure, sequence }.',
      selectedRunnerId: null,
      selectedRequestId: null,
      variables: 'Collection variables: Record<string,string>.',
      environments: 'Named environment variables: Record<string,Record<string,string>>.',
      globalVariables: 'Global variables: Record<string,string>.',
      runtimeVariables: 'Runtime variables: Record<string,string>.',
      scriptDialect: 'orkestrai | postman | bruno',
      activeEnvironment: null,
      collectionPreRequestScript: 'JavaScript source.',
      collectionPostResponseScript: 'JavaScript source.',
    },
    requestDefaults: {
      id: 'stable-unique-id', name: 'Health check', method: 'GET', protocol: 'http', url: '{{baseUrl}}/health',
      folder: '', folderId: null, sequence: 0, params: [], headers: [],
      auth: { type: 'none', token: '', username: '', password: '', key: '', value: '', placement: 'header', oauth2: {} },
      body: '', bodyMode: 'none', formFields: [], preRequestScript: '', postResponseScript: '', testScript: '', assertions: [], documentation: '',
      timeoutMs: 30000, followRedirects: true,
      graphql: { query: '', variables: '{}', operationName: '' },
      websocket: { messages: [], protocols: [], autoReconnect: false, reconnectAttempts: 3, keepAliveIntervalMs: 0 },
      grpc: { protoPath: '', service: '', method: '', methodType: 'unary', messages: [], useTls: false },
    },
    scripts: {
      bruno: {
        testScript: 'test("returns 200", () => { expect(res.getStatus()).to.equal(200); });',
        variables: 'bru.setVar("token", res.getBody().token); bru.setEnvVar("token", res.getBody().token);',
        notes: 'In the UI enter only JavaScript. Bruno export writes testScript inside the official tests { } block.',
      },
      postman: {
        testScript: 'pm.test("returns 200", () => { pm.response.to.have.status(200); });',
        variables: 'pm.collectionVariables.set("token", pm.response.json().token); pm.environment.set("token", pm.response.json().token);',
        notes: 'Post-response and testScript are emitted in the Postman test event in their original order.',
      },
      orkestrai: {
        testScript: 'test("returns 200", () => { expect(res.getStatus()).to.equal(200); });',
        variables: 'pm.collectionVariables.set("token", pm.response.json().token);',
        notes: 'The native runtime supports pm.test/pm.expect plus the global test/expect aliases.',
      },
    },
    export: {
      bruno: 'Creates an official Bruno directory with bruno.json, collection.bru, nested folders, request .bru files, environments, scripts, tests, auth, variables, and ordering. Stored secret values remain redacted.',
      postman: 'Creates a Postman Collection v2.1 JSON with nested folders, events, auth, variables, bodies, tests, and original compatible metadata. Stored secret values remain redacted.',
      path: 'Must be relative to the workspace, for example .orkestrai/exports.',
    },
    execution: {
      request: 'api_client_execute runs one saved request.',
      runner: 'api_client_run_runner runs saved order, environment, iterations, iterationData, chained scopes, tests, flow control, delay, and stopOnFailure. maxExecutions defaults to 100 and cannot exceed 500.',
    },
  };
}
