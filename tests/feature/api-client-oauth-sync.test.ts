import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { ApiClientOAuthDto, ApiClientSyncDto, ExecuteApiClientRequestDto, ImportApiClientCollectionDto } from '$lib/modules/agent-room/application/dto/ApiClientDtos.js';
import { apiClientOAuthService } from '$lib/modules/agent-room/application/services/ApiClientOAuthService.js';
import { apiClientService } from '$lib/modules/agent-room/application/services/ApiClientService.js';
import { apiClientSyncService } from '$lib/modules/agent-room/application/services/ApiClientSyncService.js';
import { apiClientNativePayloadSchema, apiClientRequestSchema } from '$lib/modules/agent-room/contracts/schemas/apiClient.schema.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

describe('API Client OAuth, cookies, and sync', () => {
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
    tempDir = await mkdtemp(join(tmpdir(), 'orkestrai-api-auth-sync-'));
    const workspace = await workspaceRepository.createWorkspace({ name: 'API', workingDir: tempDir });
    const node = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'apiClient', title: 'Project API', payload: {} });
    return { workspace, node };
  }

  it('obtains OAuth client-credentials tokens with client authentication', async () => {
    const { workspace, node } = await fixture();
    let authorization = '';
    let submitted = '';
    server = createServer((request, response) => {
      authorization = String(request.headers.authorization ?? '');
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        submitted = Buffer.concat(chunks).toString('utf8');
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ access_token: 'access-123', refresh_token: 'refresh-456', token_type: 'Bearer', expires_in: 3600 }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('OAuth test server did not bind.');
    const request = apiClientRequestSchema.parse({
      id: 'oauth-request', name: 'OAuth', method: 'GET', url: 'https://api.example.test', headers: [], body: '', bodyMode: 'none',
      auth: { type: 'oauth2', oauth2: { grantType: 'client_credentials', tokenUrl: `http://127.0.0.1:${address.port}/token`, clientId: 'client', clientSecret: 'secret', scope: 'read:all', clientAuthentication: 'header' } },
    });

    const result = await apiClientOAuthService.authorize(workspace.id, ApiClientOAuthDto.from({ action: 'authorize', nodeId: node.id, request, variables: {}, locale: 'en' }), 'http://127.0.0.1:3000');

    expect(result).toMatchObject({ status: 'complete', tokens: { accessToken: 'access-123', refreshToken: 'refresh-456', tokenType: 'Bearer' } });
    expect(authorization).toBe(`Basic ${Buffer.from('client:secret').toString('base64')}`);
    expect(new URLSearchParams(submitted).get('grant_type')).toBe('client_credentials');
  });

  it('completes the OAuth authorization-code flow with state and PKCE', async () => {
    const { workspace, node } = await fixture();
    let submitted = '';
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        submitted = Buffer.concat(chunks).toString('utf8');
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ access_token: 'authorized-token', token_type: 'Bearer' }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('OAuth test server did not bind.');
    const request = apiClientRequestSchema.parse({
      id: 'oauth-code', name: 'OAuth code', method: 'GET', url: 'https://api.example.test', headers: [], body: '', bodyMode: 'none',
      auth: { type: 'oauth2', oauth2: { grantType: 'authorization_code', authorizationUrl: 'https://identity.example.test/authorize', tokenUrl: `http://127.0.0.1:${address.port}/token`, clientId: 'desktop-client', clientAuthentication: 'body', usePkce: true } },
    });
    const started = await apiClientOAuthService.authorize(workspace.id, ApiClientOAuthDto.from({ action: 'authorize', nodeId: node.id, request, variables: {}, locale: 'en' }), 'http://127.0.0.1:3000');
    expect(started.status).toBe('pending');
    if (started.status !== 'pending') throw new Error('Expected a pending OAuth flow.');
    const authorizationUrl = new URL(started.authorizationUrl);
    expect(authorizationUrl.searchParams.get('state')).toBe(started.state);
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizationUrl.searchParams.get('code_challenge')).toBeTruthy();

    expect(await apiClientOAuthService.complete(workspace.id, started.state, 'provider-code', null)).toBe(true);
    const completed = apiClientOAuthService.poll(workspace.id, ApiClientOAuthDto.from({ action: 'poll', nodeId: node.id, state: started.state }));
    expect(completed).toMatchObject({ status: 'complete', tokens: { accessToken: 'authorized-token' } });
    const form = new URLSearchParams(submitted);
    expect(form.get('code')).toBe('provider-code');
    expect(form.get('code_verifier')).toBeTruthy();
    expect(form.get('redirect_uri')).toContain('locale=en');
  });

  it('persists response cookies and sends them on the next request', async () => {
    const { workspace, node } = await fixture();
    let seenCookie = '';
    server = createServer((request, response) => {
      if (request.url === '/login') response.setHeader('set-cookie', 'session=abc123; Path=/; HttpOnly');
      else seenCookie = String(request.headers.cookie ?? '');
      response.setHeader('content-type', 'application/json');
      response.end('{}');
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Cookie test server did not bind.');
    const base = `http://127.0.0.1:${address.port}`;
    const request = apiClientRequestSchema.parse({ id: 'cookie', name: 'Cookie', method: 'GET', url: `${base}/login`, headers: [], auth: { type: 'none' }, body: '', bodyMode: 'none' });
    await workspaceRepository.updateNode(node.id, { payload: { network: { cookieJarEnabled: true } } });
    const first = await apiClientService.execute(workspace.id, ExecuteApiClientRequestDto.from({ nodeId: node.id, request, variables: {}, timeoutMs: 3_000 }));
    expect(first.cookies).toEqual([expect.objectContaining({ key: 'session', value: 'abc123', httpOnly: true })]);
    await workspaceRepository.updateNode(node.id, { payload: { network: { cookieJarEnabled: true, cookies: first.cookies } } });
    await apiClientService.execute(workspace.id, ExecuteApiClientRequestDto.from({ nodeId: node.id, request: { ...request, url: `${base}/me` }, variables: {}, timeoutMs: 3_000 }));
    expect(seenCookie).toContain('session=abc123');
  });

  it('pushes linked Bruno changes, removes stale managed files, and detects external edits', async () => {
    const { workspace, node } = await fixture();
    const collection = join(tempDir!, 'collection');
    await mkdir(collection);
    await writeFile(join(collection, 'health.bru'), `meta {\n  name: Health\n  type: http\n  seq: 1\n}\n\nget {\n  url: https://example.test/health\n  body: none\n  auth: none\n}\n`);
    const imported = await apiClientService.import(workspace.id, ImportApiClientCollectionDto.from({ nodeId: node.id, kind: 'bruno', path: collection }));
    const changed = apiClientNativePayloadSchema.parse({
      ...imported.payload,
      requests: imported.payload.requests!.map((request) => ({ ...request, name: 'Status', url: 'https://example.test/status' })),
    });
    const pushed = await apiClientSyncService.execute(workspace.id, ApiClientSyncDto.from({ action: 'push', nodeId: node.id, payload: changed, resolution: 'orkestrai' }));
    expect(pushed).toMatchObject({ status: 'complete', direction: 'push' });
    expect(await readdir(collection)).not.toContain('health.bru');
    const statusFile = (await readdir(collection)).find((file) => /^Status\.bru$/i.test(file));
    expect(statusFile).toBeTruthy();
    expect(await readFile(join(collection, statusFile!), 'utf8')).toContain('https://example.test/status');

    await writeFile(join(collection, statusFile!), (await readFile(join(collection, statusFile!), 'utf8')).replace('/status', '/external'));
    const status = await apiClientSyncService.status(workspace.id, node.id);
    expect(status).toMatchObject({ linked: true, writable: true, sourceChanged: true, localChanged: false });
    const pulled = await apiClientSyncService.execute(workspace.id, ApiClientSyncDto.from({ action: 'pull', nodeId: node.id }));
    expect(pulled).toMatchObject({ status: 'complete', direction: 'pull', payload: { requests: [expect.objectContaining({ url: 'https://example.test/external' })] } });
  });
});
