import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { WebSocketServer } from 'ws';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { parseCollection, parseEnvironment, parseFolder, parseRequest } from '@usebruno/filestore';
import { apiClientService } from '$lib/modules/agent-room/application/services/ApiClientService.js';
import { ExportApiClientCollectionDto, ImportApiClientCollectionDto } from '$lib/modules/agent-room/application/dto/ApiClientDtos.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { apiClientRequestSchema } from '$lib/modules/agent-room/contracts/schemas/apiClient.schema.js';
import {
  ExecuteApiClientRequest,
  ExecuteSavedApiClientRequest,
  ImportApiClientCollectionRequest,
} from '$lib/modules/agent-room/interface/http/requests/ApiClientRequests.js';

function requestEvent(body: unknown, params: Record<string, string>) {
  const url = new URL('http://localhost/api/agent-room/test');
  return {
    request: new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params,
    url,
  };
}

function variableRecordForTest(value: unknown): Record<string, string> {
  return Object.fromEntries((Array.isArray(value) ? value : []).map((entry: any) => [entry.name, String(entry.value ?? '')]));
}

describe('ApiClientService', () => {
  useSvelarTest({ refreshDatabase: true });
  let server: Server | null = null;
  let websocketServer: WebSocketServer | null = null;
  let grpcServer: grpc.Server | null = null;
  let tempDir: string | null = null;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (websocketServer) await new Promise<void>((resolve) => websocketServer!.close(() => resolve()));
    if (grpcServer) await new Promise<void>((resolve) => grpcServer!.tryShutdown(() => resolve()));
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    server = null;
    websocketServer = null;
    grpcServer = null;
    tempDir = null;
  });

  async function fixture() {
    tempDir = await mkdtemp(join(tmpdir(), 'orkestrai-api-client-'));
    const workspace = await workspaceRepository.createWorkspace({ name: 'API', workingDir: tempDir });
    const node = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'apiClient',
      title: 'Project API',
      payload: { requests: [], variables: {} },
    });
    return { workspace, node };
  }

  it('imports Postman v2.1 requests, folders, headers, bodies, and variables', async () => {
    const { workspace, node } = await fixture();
    const path = join(tempDir!, 'project.postman_collection.json');
    await writeFile(path, JSON.stringify({
      info: { name: 'Project', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      variable: [{ key: 'baseUrl', value: 'https://example.test' }],
      item: [{ name: 'Users', description: 'User operations', auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{folderToken}}' }] }, item: [{
        name: 'Create',
        response: [{ name: 'Created example', code: 201, body: '{"id":1}' }],
        request: {
          method: 'POST',
          url: { raw: '{{baseUrl}}/users?expand=roles', query: [{ key: 'expand', value: 'roles' }] },
          header: [{ key: 'X-Project', value: 'Orkestrai' }],
          auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] },
          body: { mode: 'raw', raw: '{"name":"Ada"}', options: { raw: { language: 'json' } } },
        },
      }] }],
    }));

    const result = await apiClientService.import(workspace.id, ImportApiClientCollectionDto.from({
      nodeId: node.id,
      kind: 'postman',
      path,
    }));

    expect(result.collectionName).toBe('Project');
    expect(result.payload.variables).toEqual({ baseUrl: 'https://example.test' });
    expect(result.payload.requests).toEqual([
      expect.objectContaining({
        name: 'Create', folder: 'Users', method: 'POST', url: '{{baseUrl}}/users', bodyMode: 'json',
        params: [expect.objectContaining({ name: 'expand', value: 'roles' })],
        auth: expect.objectContaining({ type: 'bearer', token: '{{token}}' }),
        sourceData: expect.objectContaining({ kind: 'postman', data: expect.objectContaining({ response: [expect.objectContaining({ code: 201 })] }) }),
      }),
    ]);
    expect(result.payload.folders).toEqual([
      expect.objectContaining({
        name: 'Users',
        sourceData: expect.objectContaining({ kind: 'postman', data: expect.objectContaining({ description: 'User operations' }) }),
      }),
    ]);
    expect((await workspaceRepository.getNode(node.id))?.payload).toMatchObject({ sourceKind: 'postman', sourcePath: path });
  });

  it('imports .bru requests through Bruno official parser', async () => {
    const { workspace, node } = await fixture();
    const collection = join(tempDir!, 'bruno-project');
    await mkdir(collection);
    await writeFile(join(collection, 'health.bru'), `meta {
  name: Health
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/health
  body: none
  auth: none
}

headers {
  Accept: application/json
}
`);

    const result = await apiClientService.import(workspace.id, ImportApiClientCollectionDto.from({
      nodeId: node.id,
      kind: 'bruno',
      path: collection,
    }));

    expect(result.collectionName).toBe('bruno-project');
    expect(result.payload.requests).toEqual([
      expect.objectContaining({ name: 'Health', method: 'GET', url: '{{baseUrl}}/health' }),
    ]);
  });

  it('round-trips GraphQL, WebSocket, and gRPC requests through Bruno files', async () => {
    const { workspace, node } = await fixture();
    const requests = [
      {
        id: 'graphql', name: 'Graph', protocol: 'graphql', method: 'POST', url: 'https://api.example.test/graphql', headers: [], auth: { type: 'none' }, body: '', bodyMode: 'none',
        graphql: { query: 'query Viewer { viewer { id } }', variables: '{}', operationName: 'Viewer' },
      },
      {
        id: 'websocket', name: 'Events', protocol: 'websocket', method: 'GET', url: 'wss://api.example.test/events', headers: [], auth: { type: 'bearer', token: 'token' }, body: '', bodyMode: 'none',
        websocket: { messages: [{ id: 'ws-message', name: 'Subscribe', content: '{"type":"subscribe"}', type: 'json', enabled: true }], protocols: ['graphql-ws'], autoReconnect: true, reconnectAttempts: 4, keepAliveIntervalMs: 10_000 },
      },
      {
        id: 'grpc', name: 'Stream', protocol: 'grpc', method: 'POST', url: 'grpcs://api.example.test:443', headers: [], auth: { type: 'none' }, body: '', bodyMode: 'none',
        grpc: { protoPath: join(tempDir!, 'service.proto'), service: 'project.Streamer', method: 'Watch', methodType: 'serverStreaming', messages: [{ id: 'grpc-message', name: 'Input', content: '{"id":"1"}', type: 'json', enabled: true }], useTls: true },
      },
    ].map((request) => apiClientRequestSchema.parse(request));
    await workspaceRepository.updateNode(node.id, { payload: { formatVersion: 1, requests } });
    const destination = join(tempDir!, 'protocol-export');
    await mkdir(destination);
    const exported = await apiClientService.export(workspace.id, ExportApiClientCollectionDto.from({ nodeId: node.id, kind: 'bruno', path: destination }));
    const importedNode = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'apiClient', title: 'Imported protocols', payload: {} });
    const imported = await apiClientService.import(workspace.id, ImportApiClientCollectionDto.from({ nodeId: importedNode.id, kind: 'bruno', path: exported.path }));

    expect(imported.payload.requests?.map((request) => request.protocol)).toEqual(['graphql', 'websocket', 'grpc']);
    expect(imported.payload.requests?.[0]).toMatchObject({ graphql: { query: expect.stringContaining('query Viewer') } });
    expect(imported.payload.requests?.[1]).toMatchObject({ websocket: { messages: [expect.objectContaining({ content: '{"type":"subscribe"}' })] } });
    expect(imported.payload.requests?.[2]).toMatchObject({ grpc: { service: 'project.Streamer', method: 'Watch', methodType: 'serverStreaming' } });
  });

  it('round-trips Bruno collection scripts, variables, environments, multipart fields, and request metadata', async () => {
    const { workspace, node } = await fixture();
    const collection = join(tempDir!, 'bruno-round-trip');
    await mkdir(join(collection, 'Users'), { recursive: true });
    await mkdir(join(collection, 'environments'), { recursive: true });
    await writeFile(join(collection, 'bruno.json'), JSON.stringify({ version: '1', name: 'Round Trip API', type: 'collection' }));
    await writeFile(join(collection, 'collection.bru'), `auth {
  mode: none
}

vars:pre-request {
  baseUrl: https://api.example.test
}

script:pre-request {
  bru.setVar("collectionReady", "yes");
}
`);
    await writeFile(join(collection, 'environments', 'local.bru'), `vars {
  baseUrl: http://127.0.0.1:3000
  token: local-secret
}
`);
    await writeFile(join(collection, 'Users', 'folder.bru'), `meta {
  name: Users
  seq: 3
}

auth {
  mode: inherit
}

script:pre-request {
  bru.setVar("folderReady", "yes");
}
`);
    await writeFile(join(collection, 'Users', 'create.bru'), `meta {
  name: Create user
  type: http
  seq: 7
}

post {
  url: {{baseUrl}}/users
  body: multipartForm
  auth: bearer
}

auth:bearer {
  token: {{token}}
}

body:multipart-form {
  name: Ada
  avatar: @file(avatar.png)
}

docs {
  Creates a user.
}

settings {
  encodeUrl: true
}
`);

    const imported = await apiClientService.import(workspace.id, ImportApiClientCollectionDto.from({
      nodeId: node.id,
      kind: 'bruno',
      path: collection,
    }));
    expect(imported.collectionName).toBe('Round Trip API');
    expect(imported.payload).toMatchObject({
      formatVersion: 1,
      variables: { baseUrl: 'https://api.example.test' },
      environments: { local: { baseUrl: 'http://127.0.0.1:3000', token: 'local-secret' } },
      collectionPreRequestScript: expect.stringContaining('collectionReady'),
      requests: [expect.objectContaining({
        name: 'Create user', folder: 'Users', bodyMode: 'multipart', documentation: 'Creates a user.',
        sourceData: expect.objectContaining({ kind: 'bruno', data: expect.objectContaining({ settings: expect.objectContaining({ encodeUrl: true }) }) }),
      })],
      folders: [expect.objectContaining({
        name: 'Users', sequence: 2,
        sourceData: expect.objectContaining({ kind: 'bruno', data: expect.objectContaining({ request: expect.objectContaining({ script: expect.objectContaining({ req: expect.stringContaining('folderReady') }) }) }) }),
      })],
    });

    const destination = join(tempDir!, 'exports');
    await mkdir(destination);
    const exported = await apiClientService.export(workspace.id, ExportApiClientCollectionDto.from({
      nodeId: node.id,
      kind: 'bruno',
      path: destination,
    }));
    const exportedCollection = parseCollection(await readFile(join(exported.path, 'collection.bru'), 'utf8'), { format: 'bru' });
    const exportedRequest = parseRequest(await readFile(join(exported.path, 'Users', 'Create user.bru'), 'utf8'), { format: 'bru' });
    const exportedFolder = parseFolder(await readFile(join(exported.path, 'Users', 'folder.bru'), 'utf8'), { format: 'bru' });
    const exportedEnvironment = parseEnvironment(await readFile(join(exported.path, 'environments', 'local.bru'), 'utf8'), { format: 'bru' });
    expect(exportedCollection.request.script.req).toContain('collectionReady');
    expect(variableRecordForTest(exportedCollection.request.vars.req)).toMatchObject({ baseUrl: 'https://api.example.test' });
    expect(exportedRequest).toMatchObject({
      name: 'Create user',
      settings: expect.objectContaining({ encodeUrl: true }),
      request: { method: 'POST', body: { mode: 'multipartForm' }, auth: { mode: 'bearer' } },
    });
    expect(variableRecordForTest(exportedEnvironment.variables)).toMatchObject({ token: 'local-secret' });
    expect(exportedFolder.request.script.req).toContain('folderReady');
  });

  it('restores the complete versioned Orkestrai collection state', async () => {
    const { workspace, node } = await fixture();
    const path = join(tempDir!, 'project.orkestrai-api.json');
    await writeFile(path, JSON.stringify({
      schema: 'https://orkestrai.app/schemas/api-client/v1',
      version: 1,
      name: 'Portable project API',
      exportedAt: '2026-08-20T12:00:00.000Z',
      payload: {
        formatVersion: 1,
        sourceKind: 'postman',
        sourcePath: '/old-machine/project.postman_collection.json',
        sourceCollection: { info: { name: 'Project metadata' } },
        requests: [{
          id: 'request-1', name: 'Draft request', method: 'POST', url: '', folder: '', folderId: 'folder-1', sequence: 0,
          params: [], headers: [], auth: { type: 'none', token: '', username: '', password: '', key: '', value: '', placement: 'header' },
          body: '', bodyMode: 'none', formFields: [], preRequestScript: '', postResponseScript: '', assertions: [], documentation: '',
          timeoutMs: 30_000, followRedirects: true, sourcePath: null, sourceData: null,
        }],
        folders: [{ id: 'folder-1', name: 'Drafts', parentId: null, sequence: 0 }],
        runners: [{ id: 'runner-1', name: 'Smoke', requestIds: ['request-1'], environment: 'local', iterations: 2, delayMs: 25, stopOnFailure: true, sequence: 0 }],
        selectedRunnerId: 'runner-1', selectedRequestId: 'request-1',
        variables: { baseUrl: 'https://example.test' },
        environments: { local: { token: 'secret' } }, activeEnvironment: 'local',
        history: [{ id: 'history-1', requestId: 'request-1', requestName: 'Draft request', method: 'POST', url: 'https://example.test', status: 201, ok: true, durationMs: 42, size: 12, testPassed: 1, testFailed: 0, executedAt: '2026-08-20T12:00:00.000Z' }],
        collectionPreRequestScript: 'bru.setVar("ready", "yes")', collectionPostResponseScript: '',
      },
    }));

    const result = await apiClientService.import(workspace.id, ImportApiClientCollectionDto.from({
      nodeId: node.id,
      kind: 'native',
      path,
    }));

    expect(result.collectionName).toBe('Portable project API');
    expect(result.payload).toMatchObject({
      sourceKind: 'postman', sourcePath: null, selectedRunnerId: 'runner-1', selectedRequestId: 'request-1', activeEnvironment: 'local',
      folders: [{ id: 'folder-1', name: 'Drafts' }],
      runners: [{ id: 'runner-1', name: 'Smoke', iterations: 2 }],
      requests: [{ id: 'request-1', name: 'Draft request', url: '' }],
      history: [{ id: 'history-1', status: 201 }],
    });
  });

  it('imports OpenAPI 3.1 with local references, samples, security, and compatibility notes', async () => {
    const { workspace, node } = await fixture();
    const schemas = join(tempDir!, 'schemas.yaml');
    const path = join(tempDir!, 'openapi.yaml');
    await writeFile(schemas, `UserInput:
  type: object
  required: [name]
  properties:
    name:
      type: string
      example: Ada
    active:
      type: boolean
      default: true
`);
    await writeFile(path, `openapi: 3.1.0
info:
  title: Users API
  version: 2.0.0
servers:
  - url: https://api.example.test/v2
  - url: https://staging.example.test/v2
paths:
  /users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: string, example: user-42 }
    post:
      summary: Update user
      tags: [Users]
      security:
        - bearerAuth: []
      parameters:
        - name: include
          in: query
          schema: { type: string, default: profile }
        - name: session
          in: cookie
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: ./schemas.yaml#/UserInput
      responses:
        '200': { description: Updated }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
`);

    const result = await apiClientService.import(workspace.id, ImportApiClientCollectionDto.from({
      nodeId: node.id,
      kind: 'openapi',
      path,
    }));

    expect(result.collectionName).toBe('Users API');
    expect(result.payload).toMatchObject({
      sourceKind: 'openapi',
      variables: { baseUrl: 'https://api.example.test/v2', id: 'user-42' },
      folders: [expect.objectContaining({ name: 'Users' })],
      requests: [expect.objectContaining({
        name: 'Update user', method: 'POST', url: '{{baseUrl}}/users/{{id}}', bodyMode: 'json',
        body: expect.stringContaining('Ada'),
        params: [expect.objectContaining({ name: 'include', value: 'profile' })],
        auth: expect.objectContaining({ type: 'bearer', token: '{{accessToken}}' }),
        assertions: [expect.objectContaining({ source: 'status', expected: '200' })],
      })],
      compatibilityWarnings: expect.arrayContaining([
        expect.objectContaining({ code: 'multiple_servers' }),
        expect.objectContaining({ code: 'cookie_parameters_ignored' }),
      ]),
    });
  });

  it('does not resolve OpenAPI files outside the selected document directory', async () => {
    const { workspace, node } = await fixture();
    const specDirectory = join(tempDir!, 'contract');
    await mkdir(specDirectory);
    await writeFile(join(tempDir!, 'outside.yaml'), 'type: object\nproperties: {}\n');
    const path = join(specDirectory, 'openapi.yaml');
    await writeFile(path, `openapi: 3.1.0
info: { title: Unsafe, version: 1.0.0 }
paths:
  /unsafe:
    post:
      requestBody:
        content:
          application/json:
            schema: { $ref: ../outside.yaml }
      responses:
        '200': { description: OK }
`);

    await expect(apiClientService.import(workspace.id, ImportApiClientCollectionDto.from({
      nodeId: node.id,
      kind: 'openapi',
      path,
    }))).rejects.toThrow();
  });

  it('imports Swagger 2.0 contracts without requiring a separate conversion tool', async () => {
    const { workspace, node } = await fixture();
    const path = join(tempDir!, 'swagger.json');
    await writeFile(path, JSON.stringify({
      swagger: '2.0',
      info: { title: 'Legacy Pets', version: '1.0.0' },
      host: 'legacy.example.test',
      basePath: '/api',
      schemes: ['https'],
      securityDefinitions: { basicAuth: { type: 'basic' } },
      security: [{ basicAuth: [] }],
      paths: {
        '/pets/{id}': {
          get: {
            summary: 'Read pet',
            tags: ['Pets'],
            parameters: [
              { name: 'id', in: 'path', required: true, type: 'string', default: 'pet-7' },
              { name: 'expand', in: 'query', required: false, type: 'string', default: 'owner' },
            ],
            responses: { 200: { description: 'Pet' } },
          },
        },
      },
    }));

    const result = await apiClientService.import(workspace.id, ImportApiClientCollectionDto.from({ nodeId: node.id, kind: 'openapi', path }));
    expect(result.payload).toMatchObject({
      variables: { baseUrl: 'https://legacy.example.test/api', id: 'pet-7' },
      requests: [expect.objectContaining({
        name: 'Read pet', url: '{{baseUrl}}/pets/{{id}}',
        auth: expect.objectContaining({ type: 'basic', username: '{{username}}', password: '{{password}}' }),
        params: [expect.objectContaining({ name: 'expand', value: 'owner' })],
      })],
    });
  });

  it('imports a Postman environment without replacing the current collection', async () => {
    const { workspace, node } = await fixture();
    await workspaceRepository.updateNode(node.id, { payload: { requests: [{ id: 'health', name: 'Health' }], variables: { baseUrl: 'https://example.test' } } });
    const path = join(tempDir!, 'local.postman_environment.json');
    await writeFile(path, JSON.stringify({
      name: 'Local',
      values: [
        { key: 'token', value: 'secret', enabled: true, type: 'secret' },
        { key: 'disabled', value: 'skip', enabled: false },
      ],
    }));

    const result = await apiClientService.import(workspace.id, ImportApiClientCollectionDto.from({
      nodeId: node.id,
      kind: 'postmanEnvironment',
      path,
    }));

    expect(result.payload).toMatchObject({
      requests: [{ id: 'health', name: 'Health' }],
      variables: { baseUrl: 'https://example.test' },
      environments: { Local: { token: 'secret' } },
      activeEnvironment: 'Local',
    });
  });

  it('exports and imports an OpenCollection YAML workspace', async () => {
    const { workspace, node } = await fixture();
    await workspaceRepository.updateNode(node.id, {
      payload: {
        requests: [{
          id: 'health', name: 'Health', method: 'GET', url: '{{baseUrl}}/health', folder: '', sequence: 0,
          params: [], headers: [{ id: 'accept', name: 'Accept', value: 'application/json', enabled: true }],
          auth: { type: 'none', token: '', username: '', password: '', key: '', value: '', placement: 'header' },
          body: '', bodyMode: 'none', formFields: [], preRequestScript: '', postResponseScript: '', assertions: [], documentation: 'Readiness probe.',
          timeoutMs: 30_000, followRedirects: true, sourcePath: null, sourceData: null,
        }],
        variables: { baseUrl: 'https://example.test' },
        environments: { local: { baseUrl: 'http://127.0.0.1:3000' } },
      },
    });
    const destination = join(tempDir!, 'exports');
    await mkdir(destination);
    const exported = await apiClientService.export(workspace.id, ExportApiClientCollectionDto.from({ nodeId: node.id, kind: 'openCollection', path: destination }));
    expect(await readdir(exported.path)).toContain('Health.yml');
    expect(await readFile(join(exported.path, 'opencollection.yml'), 'utf8')).toContain('opencollection: 1.0.0');
    expect(await readFile(join(exported.path, 'Health.yml'), 'utf8')).toContain('url: "{{baseUrl}}/health"');

    const importedNode = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'apiClient', title: 'Imported', payload: {} });
    const imported = await apiClientService.import(workspace.id, ImportApiClientCollectionDto.from({
      nodeId: importedNode.id,
      kind: 'openCollection',
      path: join(exported.path, 'opencollection.yml'),
    }));
    expect(imported.payload).toMatchObject({
      sourceKind: 'openCollection',
      requests: [expect.objectContaining({ name: 'Health', url: '{{baseUrl}}/health' })],
      variables: { baseUrl: 'https://example.test' },
      environments: { local: { baseUrl: 'http://127.0.0.1:3000' } },
    });
  });

  it('executes GraphQL queries with variables through the shared runner path', async () => {
    const { workspace, node } = await fixture();
    let received: any = null;
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        received = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ data: { hello: received.variables.name } }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('GraphQL test server did not bind.');
    const request = {
      id: 'graphql-1', name: 'Hello', protocol: 'graphql', method: 'POST', url: `http://127.0.0.1:${address.port}/graphql`,
      headers: [], auth: { type: 'none', token: '', username: '', password: '' }, body: '', bodyMode: 'none',
      graphql: { query: 'query Hello($name: String!) { hello(name: $name) }', variables: '{"name":"{{name}}"}', operationName: 'Hello' },
    };
    await workspaceRepository.updateNode(node.id, { payload: { requests: [request] } });

    const result = await apiClientService.executeSaved(workspace.id, node.id, request.id, { name: 'Orkestrai' });

    expect(result).toMatchObject({ status: 200, ok: true, body: expect.stringContaining('Orkestrai') });
    expect(received).toMatchObject({ operationName: 'Hello', variables: { name: 'Orkestrai' } });
  });

  it('executes WebSocket handshakes and preserves the bidirectional transcript', async () => {
    const { workspace, node } = await fixture();
    websocketServer = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) => websocketServer!.once('listening', resolve));
    websocketServer.on('connection', (socket) => socket.on('message', (data, isBinary) => socket.send(data, { binary: isBinary })));
    const address = websocketServer.address();
    if (!address || typeof address === 'string') throw new Error('WebSocket test server did not bind.');
    const request = {
      id: 'ws-1', name: 'Echo', protocol: 'websocket', method: 'GET', url: `ws://127.0.0.1:${address.port}`,
      headers: [], auth: { type: 'none', token: '', username: '', password: '' }, body: '', bodyMode: 'none', timeoutMs: 3_000,
      websocket: { messages: [{ id: 'message-1', name: 'Ping', content: '{"ping":true}', type: 'json', enabled: true }], protocols: [], autoReconnect: false, reconnectAttempts: 0, keepAliveIntervalMs: 0 },
    };
    await workspaceRepository.updateNode(node.id, { payload: { requests: [request] } });

    const result = await apiClientService.executeSaved(workspace.id, node.id, request.id, {});

    expect(result).toMatchObject({ status: 101, ok: true, protocol: 'websocket' });
    expect(result.messages).toEqual([
      expect.objectContaining({ direction: 'sent', type: 'json', content: '{"ping":true}' }),
      expect.objectContaining({ direction: 'received', type: 'json', content: '{"ping":true}' }),
    ]);
  });

  it('loads proto files and executes gRPC unary methods', async () => {
    const { workspace, node } = await fixture();
    const protoPath = join(tempDir!, 'echo.proto');
    await writeFile(protoPath, `syntax = "proto3";
package test;
service Echo { rpc Say (EchoRequest) returns (EchoReply); }
message EchoRequest { string text = 1; }
message EchoReply { string text = 1; }
`);
    const definition = await protoLoader.load(protoPath, { defaults: true });
    const root = grpc.loadPackageDefinition(definition) as any;
    grpcServer = new grpc.Server();
    grpcServer.addService(root.test.Echo.service, {
      say: (call: grpc.ServerUnaryCall<{ text: string }, { text: string }>, callback: grpc.sendUnaryData<{ text: string }>) => callback(null, { text: `Echo: ${call.request.text}` }),
    });
    const port = await new Promise<number>((resolve, reject) => grpcServer!.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, boundPort) => error ? reject(error) : resolve(boundPort)));
    const request = {
      id: 'grpc-1', name: 'Say', protocol: 'grpc', method: 'POST', url: `127.0.0.1:${port}`,
      headers: [], auth: { type: 'none', token: '', username: '', password: '' }, body: '', bodyMode: 'none', timeoutMs: 3_000,
      grpc: { protoPath, service: 'test.Echo', method: 'Say', methodType: 'unary', messages: [{ id: 'message-1', name: 'Request', content: '{"text":"Hello"}', type: 'json', enabled: true }], useTls: false },
    };
    await workspaceRepository.updateNode(node.id, { payload: { requests: [request] } });

    const result = await apiClientService.executeSaved(workspace.id, node.id, request.id, {});

    expect(result).toMatchObject({ status: 0, ok: true, protocol: 'grpc', body: expect.stringContaining('Echo: Hello') });
    expect(result.messages).toEqual(expect.arrayContaining([expect.objectContaining({ direction: 'received', content: expect.stringContaining('Echo: Hello') })]));
  });

  it('executes gRPC server-streaming methods and records every response', async () => {
    const { workspace, node } = await fixture();
    const protoPath = join(tempDir!, 'stream.proto');
    await writeFile(protoPath, `syntax = "proto3";
package test;
service Streamer { rpc Watch (WatchRequest) returns (stream WatchReply); }
message WatchRequest { string topic = 1; }
message WatchReply { string event = 1; }
`);
    const definition = await protoLoader.load(protoPath, { defaults: true });
    const root = grpc.loadPackageDefinition(definition) as any;
    grpcServer = new grpc.Server();
    grpcServer.addService(root.test.Streamer.service, {
      watch: (call: grpc.ServerWritableStream<{ topic: string }, { event: string }>) => {
        call.write({ event: `${call.request.topic}:one` });
        call.write({ event: `${call.request.topic}:two` });
        call.end();
      },
    });
    const port = await new Promise<number>((resolve, reject) => grpcServer!.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, boundPort) => error ? reject(error) : resolve(boundPort)));
    const request = {
      id: 'grpc-stream', name: 'Watch', protocol: 'grpc', method: 'POST', url: `127.0.0.1:${port}`,
      headers: [], auth: { type: 'none', token: '', username: '', password: '' }, body: '', bodyMode: 'none', timeoutMs: 3_000,
      grpc: { protoPath, service: 'test.Streamer', method: 'Watch', methodType: 'serverStreaming', messages: [{ id: 'message-1', name: 'Request', content: '{"topic":"deploy"}', type: 'json', enabled: true }], useTls: false },
    };
    await workspaceRepository.updateNode(node.id, { payload: { requests: [request] } });

    const result = await apiClientService.executeSaved(workspace.id, node.id, request.id, {});

    expect(result).toMatchObject({ status: 0, ok: true, protocol: 'grpc' });
    expect(result.messages?.filter((message) => message.direction === 'received')).toHaveLength(2);
    expect(result.body).toContain('deploy:two');
  });

  it('executes a request with variable interpolation and returns response metrics', async () => {
    const { workspace, node } = await fixture();
    server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ path: request.url, project: request.headers['x-project'], authorization: request.headers.authorization }));
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');

    const request = {
      id: 'request-1',
      name: 'Health',
      method: 'GET',
      url: '{{baseUrl}}/health',
      headers: [{ id: 'header-1', name: 'X-Project', value: '{{project}}', enabled: true }],
      auth: { type: 'bearer', token: '{{token}}', username: '', password: '' },
      body: '',
      bodyMode: 'none',
    } as const;
    await workspaceRepository.updateNode(node.id, { payload: { requests: [request], variables: {} } });
    const agent = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'terminal', title: 'QA' });
    await workspaceRepository.createEdge({ workspaceId: workspace.id, sourceNodeId: agent.id, targetNodeId: node.id });

    expect(await apiClientService.list(workspace.id, agent.id)).toEqual([
      expect.objectContaining({ nodeId: node.id, requests: [expect.objectContaining({ requestId: 'request-1', authType: 'bearer' })] }),
    ]);
    const result = await apiClientService.executeSaved(workspace.id, node.id, request.id, {
      baseUrl: `http://127.0.0.1:${address.port}`,
      project: 'Orkestrai',
      token: 'secret',
    }, agent.id);

    expect(result).toMatchObject({ status: 200, ok: true, contentType: 'application/json' });
    expect(JSON.parse(result.body)).toEqual({ path: '/health', project: 'Orkestrai', authorization: 'Bearer secret' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.size).toBeGreaterThan(0);
  });

  it('runs sandboxed scripts, query/auth parameters, and response assertions', async () => {
    const { workspace, node } = await fixture();
    server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      response.setHeader('x-result', 'ready');
      response.end(JSON.stringify({
        path: request.url,
        script: request.headers['x-script'],
        collection: request.headers['x-collection'],
      }));
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');

    const request = {
      id: 'scripted-request',
      name: 'Scripted request',
      method: 'GET',
      url: '{{baseUrl}}/users',
      folder: 'Users',
      sequence: 0,
      params: [{ id: 'param-1', name: 'token', value: '{{scriptToken}}', enabled: true }],
      headers: [],
      auth: { type: 'apiKey', token: '', username: '', password: '', key: 'api_key', value: '{{apiKey}}', placement: 'query' },
      body: '',
      bodyMode: 'none',
      formFields: [],
      preRequestScript: 'bru.setVar("scriptToken", "from-script"); req.setHeader("X-Script", "yes"); req.setHeader("X-Collection", bru.getVar("collectionValue"));',
      postResponseScript: 'bru.setVar("lastStatus", res.status); console.log("request status", res.status);',
      assertions: [
        { id: 'status', source: 'status', property: '', operator: 'equals', expected: '200', enabled: true },
        { id: 'body', source: 'body', property: 'script', operator: 'equals', expected: 'yes', enabled: true },
        { id: 'header', source: 'header', property: 'x-result', operator: 'equals', expected: 'ready', enabled: true },
      ],
      documentation: '',
      timeoutMs: 5_000,
      followRedirects: true,
      sourcePath: null,
    } as const;
    await workspaceRepository.updateNode(node.id, {
      payload: {
        requests: [request],
        variables: {},
        collectionPreRequestScript: 'bru.setVar("collectionValue", "from-collection"); console.log("collection pre");',
        collectionPostResponseScript: 'console.log("collection post", res.status);',
      },
    });

    const result = await apiClientService.executeSaved(workspace.id, node.id, request.id, {
      baseUrl: `http://127.0.0.1:${address.port}`,
      apiKey: 'secret',
    });

    expect(result).toMatchObject({ status: 200, variables: { scriptToken: 'from-script', collectionValue: 'from-collection', lastStatus: '200' } });
    expect(JSON.parse(result.body)).toEqual({
      path: '/users?token=from-script&api_key=secret',
      script: 'yes',
      collection: 'from-collection',
    });
    expect(result.tests).toEqual([
      expect.objectContaining({ id: 'status', passed: true }),
      expect.objectContaining({ id: 'body', passed: true }),
      expect.objectContaining({ id: 'header', passed: true }),
    ]);
    expect(result.scriptLogs).toEqual(['collection pre', 'request status 200', 'collection post 200']);
  });

  it('executes imported Bruno variables, assertions, and tests with source scope precedence', async () => {
    const { workspace, node } = await fixture();
    let visited = '';
    server = createServer((request, response) => {
      visited = request.url ?? '';
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Bruno compatibility server did not bind.');

    const request = apiClientRequestSchema.parse({
      id: 'bruno-compatible',
      name: 'Bruno compatible',
      method: 'GET',
      protocol: 'http',
      url: '{{baseUrl}}/{{folderSegment}}/{{requestSegment}}',
      folderId: 'folder',
      headers: [],
      auth: { type: 'none' },
      sourcePath: join(tempDir!, 'request.bru'),
      sourceData: {
        kind: 'bruno',
        data: {
          request: {
            vars: {
              req: [{ name: 'requestSegment', value: 'request', enabled: true }],
              res: [{ name: 'capturedStatus', value: 'res.status', enabled: true }],
            },
            assertions: [
              { name: 'res.status', value: 'eq 200', enabled: true },
              { name: 'res.body.ok', value: 'isTruthy', enabled: true },
            ],
            tests: `test('Bruno tests block works', () => expect(res.getStatus()).to.equal(200));\nbru.setVar('fromTests', 'yes');`,
          },
        },
      },
    });
    await workspaceRepository.updateNode(node.id, {
      payload: {
        sourceKind: 'bruno',
        sourcePath: tempDir,
        scriptDialect: 'bruno',
        variables: { baseUrl: `http://127.0.0.1:${address.port}` },
        folders: [{
          id: 'folder', name: 'Folder', parentId: null, sequence: 0,
          sourceData: { kind: 'bruno', data: { request: { vars: { req: [{ name: 'folderSegment', value: 'folder', enabled: true }] } } } },
        }],
        requests: [request],
      },
    });

    const result = await apiClientService.executeSaved(workspace.id, node.id, request.id, {});

    expect(visited).toBe('/folder/request');
    expect(result.variables).toMatchObject({ capturedStatus: '200', fromTests: 'yes' });
    expect(result.tests).toEqual(expect.arrayContaining([
      expect.objectContaining({ passed: true, label: 'Bruno tests block works' }),
      expect.objectContaining({ passed: true }),
      expect.objectContaining({ passed: true }),
    ]));
  });

  it('passes variables produced by one request into the next request', async () => {
    const { workspace, node } = await fixture();
    const visited: string[] = [];
    server = createServer((request, response) => {
      visited.push(request.url ?? '');
      response.setHeader('content-type', 'application/json');
      response.end(request.url === '/session' ? JSON.stringify({ userId: 'user-42' }) : JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const first = {
      id: 'session', name: 'Create session', method: 'GET', url: '{{baseUrl}}/session', headers: [],
      auth: { type: 'none', token: '', username: '', password: '' }, body: '', bodyMode: 'none',
      postResponseScript: 'pm.environment.set("userId", pm.response.json().userId);',
    } as const;
    const second = {
      id: 'profile', name: 'Load profile', method: 'GET', url: '{{baseUrl}}/users/{{userId}}', headers: [],
      auth: { type: 'none', token: '', username: '', password: '' }, body: '', bodyMode: 'none',
    } as const;
    await workspaceRepository.updateNode(node.id, { payload: { requests: [first, second], variables: { baseUrl } } });

    const session = await apiClientService.executeSaved(workspace.id, node.id, first.id, { baseUrl });
    await apiClientService.executeSaved(workspace.id, node.id, second.id, session.variables);

    expect(session.variables).toMatchObject({ baseUrl, userId: 'user-42' });
    expect(visited).toEqual(['/session', '/users/user-42']);
  });
});

describe('API client FormRequests', () => {
  const savedRequest = {
    id: 'request-1',
    name: 'Health',
    method: 'GET',
    url: 'https://example.test/health',
    headers: [],
    auth: { type: 'none', token: '', username: '', password: '' },
    body: '',
    bodyMode: 'none',
    sourcePath: null,
  };

  it('accepts route parameters injected by Svelar without leaking them into DTO input', async () => {
    const execute = await ExecuteApiClientRequest.validate(requestEvent({
      nodeId: 'node-1',
      request: savedRequest,
      variables: {},
    }, { id: 'workspace-1' }) as any);
    const imported = await ImportApiClientCollectionRequest.validate(requestEvent({
      nodeId: 'node-1',
      kind: 'postman',
      path: '/tmp/project.postman_collection.json',
    }, { id: 'workspace-1' }) as any);
    const saved = await ExecuteSavedApiClientRequest.validate(requestEvent({
      requestId: 'request-1',
      variables: {},
    }, { nodeId: 'node-1' }) as any);

    expect(execute).toMatchObject({ nodeId: 'node-1', timeoutMs: 30_000 });
    expect(execute).not.toHaveProperty('id');
    expect(imported).toMatchObject({ nodeId: 'node-1', kind: 'postman' });
    expect(imported).not.toHaveProperty('id');
    expect(saved).toMatchObject({ requestId: 'request-1' });
    expect(saved).not.toHaveProperty('nodeId');
  });
});
