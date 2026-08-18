import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { apiClientService } from '$lib/modules/agent-room/application/services/ApiClientService.js';
import { ImportApiClientCollectionDto } from '$lib/modules/agent-room/application/dto/ApiClientDtos.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
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

describe('ApiClientService', () => {
  useSvelarTest({ refreshDatabase: true });
  let server: Server | null = null;
  let tempDir: string | null = null;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    server = null;
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
      item: [{ name: 'Users', item: [{
        name: 'Create',
        request: {
          method: 'POST',
          url: { raw: '{{baseUrl}}/users' },
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
      expect.objectContaining({ name: 'Users / Create', method: 'POST', url: '{{baseUrl}}/users', bodyMode: 'json', auth: expect.objectContaining({ type: 'bearer', token: '{{token}}' }) }),
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
