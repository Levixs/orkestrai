import { describe, expect, it } from 'vitest';
import {
  apiClientDescendantFolderIds,
  apiClientFolderPath,
  apiClientTreeRows,
  migrateApiClientFolders,
  normalizeApiClientRunners,
} from '../../src/lib/modules/agent-room/domain/api-client-collection.js';
import type { ApiClientRequest } from '../../src/lib/modules/agent-room/domain/types.js';
import { exportOpenApiDocument } from '../../src/lib/modules/agent-room/domain/api-client-openapi-export.js';

function request(id: string, folder = ''): ApiClientRequest {
  return {
    id,
    name: id,
    method: 'GET',
    url: 'https://example.test',
    folder,
    headers: [],
    auth: { type: 'none', token: '', username: '', password: '' },
    body: '',
    bodyMode: 'none',
  };
}

describe('API client collections', () => {
  it('migrates legacy folder paths into stable nested folders', () => {
    const first = migrateApiClientFolders([request('one', 'Users / Admin'), request('two', 'Users')]);
    const second = migrateApiClientFolders(first.requests, first.folders);

    expect(first.folders).toHaveLength(2);
    expect(first.requests[0].folderId).not.toBe(first.requests[1].folderId);
    expect(apiClientFolderPath(first.folders, first.requests[0].folderId)).toBe('Users / Admin');
    expect(second.migrated).toBe(false);
    expect(second).toMatchObject({ requests: first.requests, folders: first.folders });
  });

  it('flattens nested folders and hides collapsed descendants', () => {
    const migrated = migrateApiClientFolders([request('admin', 'Users / Admin'), request('root')]);
    const users = migrated.folders.find((folder) => folder.name === 'Users')!;
    const admin = migrated.folders.find((folder) => folder.name === 'Admin')!;

    expect(apiClientTreeRows(migrated.folders, migrated.requests).map((row) => [row.kind, row.id, row.depth])).toEqual([
      ['folder', users.id, 0],
      ['folder', admin.id, 1],
      ['request', 'admin', 2],
      ['request', 'root', 0],
    ]);
    expect(apiClientTreeRows(migrated.folders, migrated.requests, new Set([users.id])).map((row) => row.id)).toEqual([users.id, 'root']);
    expect(apiClientDescendantFolderIds(migrated.folders, users.id)).toEqual(new Set([users.id, admin.id]));
  });

  it('repairs persisted runners when requests are removed', () => {
    expect(normalizeApiClientRunners([{
      id: 'smoke', name: 'Smoke', requestIds: ['one', 'missing', 'two'], environment: null,
      iterations: 0, delayMs: -10, stopOnFailure: true, sequence: 0,
    }], ['one', 'two'])).toEqual([expect.objectContaining({ requestIds: ['one', 'two'], iterations: 1, delayMs: 0 })]);
  });

  it('exports editable requests as an OpenAPI 3.1 contract without auth secrets', () => {
    const document = exportOpenApiDocument('Accounts API', {
      variables: { baseUrl: 'https://api.example.test', id: 'account-1' },
      requests: [{
        ...request('read-account', ''),
        name: 'Read account',
        url: '{{baseUrl}}/accounts/{{id}}',
        params: [{ id: 'expand', name: 'expand', value: 'owner', enabled: true }],
        headers: [{ id: 'trace', name: 'X-Trace', value: '{{traceId}}', enabled: true }],
        auth: { type: 'bearer', token: 'must-not-leak', username: '', password: '' },
        assertions: [{ id: 'status', source: 'status', property: '', operator: 'equals', expected: '204', enabled: true }],
        documentation: 'Returns one account.',
      }],
    }) as any;

    expect(document).toMatchObject({
      openapi: '3.1.0',
      info: { title: 'Accounts API' },
      servers: [{ url: 'https://api.example.test' }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
      paths: {
        '/accounts/{id}': {
          get: {
            summary: 'Read account',
            responses: { 204: { description: 'Successful response' } },
            security: [{ bearerAuth: [] }],
            parameters: expect.arrayContaining([
              expect.objectContaining({ name: 'id', in: 'path', required: true }),
              expect.objectContaining({ name: 'expand', in: 'query' }),
              expect.objectContaining({ name: 'X-Trace', in: 'header' }),
            ]),
          },
        },
      },
    });
    expect(JSON.stringify(document)).not.toContain('must-not-leak');
  });
});
