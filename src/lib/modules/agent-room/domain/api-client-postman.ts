import type { ApiClientFolder, ApiClientNodePayload, ApiClientRequest } from './types.js';

type PostmanItem = {
  name: string;
  item?: PostmanItem[];
  request?: Record<string, unknown>;
  event?: unknown[];
  [key: string]: unknown;
};

function requestItem(request: ApiClientRequest): PostmanItem {
  const original = request.sourceData?.kind === 'postman'
    ? structuredClone(request.sourceData.data) as Record<string, any>
    : {};
  const generatedAuth = request.auth.type === 'bearer'
    ? { type: 'bearer', bearer: [{ key: 'token', value: request.auth.token, type: 'string' }] }
    : request.auth.type === 'basic'
      ? { type: 'basic', basic: [{ key: 'username', value: request.auth.username, type: 'string' }, { key: 'password', value: request.auth.password, type: 'string' }] }
      : request.auth.type === 'apiKey'
        ? { type: 'apikey', apikey: [{ key: 'key', value: request.auth.key ?? '', type: 'string' }, { key: 'value', value: request.auth.value ?? '', type: 'string' }, { key: 'in', value: request.auth.placement === 'query' ? 'query' : 'header', type: 'string' }] }
        : request.auth.type === 'oauth2'
          ? { type: 'oauth2', oauth2: Object.entries(request.auth.oauth2 ?? {}).map(([key, value]) => ({ key, value, type: typeof value })) }
          : { type: 'noauth' };
  const originalAuth = original.request?.auth;
  const auth = request.auth.type === 'none' && originalAuth?.type && !['noauth', 'basic', 'bearer', 'apikey'].includes(originalAuth.type)
    ? originalAuth
    : generatedAuth;
  const originalBody = original.request?.body;
  const originalFormData = Array.isArray(originalBody?.formdata) ? originalBody.formdata : [];
  const generatedBody = request.protocol === 'graphql'
    ? { mode: 'graphql', graphql: { query: request.graphql?.query ?? '', variables: request.graphql?.variables ?? '{}' } }
    : request.bodyMode === 'form'
      ? { mode: 'urlencoded', urlencoded: (request.formFields ?? []).map((field) => ({ key: field.name, value: field.value, disabled: !field.enabled, type: 'text' })) }
      : request.bodyMode === 'multipart'
        ? { mode: 'formdata', formdata: (request.formFields ?? []).map((field) => {
            const previous = originalFormData.find((entry: any) => entry?.key === field.name);
            return previous?.type === 'file'
              ? { ...previous, key: field.name, disabled: !field.enabled, type: 'file' }
              : { ...previous, key: field.name, value: field.value, disabled: !field.enabled, type: 'text' };
          }) }
        : request.bodyMode === 'none'
          ? undefined
          : { ...originalBody, mode: 'raw', raw: request.body, options: { ...(originalBody?.options ?? {}), raw: { ...(originalBody?.options?.raw ?? {}), language: request.bodyMode === 'json' ? 'json' : request.bodyMode === 'xml' ? 'xml' : 'text' } } };
  const body = request.bodyMode === 'none' && originalBody?.mode && !['raw', 'urlencoded', 'formdata'].includes(originalBody.mode)
    ? originalBody
    : generatedBody;
  const responseScripts = [request.postResponseScript, request.testScript]
    .filter((script) => script?.trim())
    .join('\n\n');
  const event = [
    ...(Array.isArray(original.event) ? original.event.filter((entry: any) => !['prerequest', 'test'].includes(entry?.listen)) : []),
    request.preRequestScript?.trim() ? { listen: 'prerequest', script: { type: 'text/javascript', exec: request.preRequestScript.split('\n') } } : null,
    responseScripts ? { listen: 'test', script: { type: 'text/javascript', exec: responseScripts.split('\n') } } : null,
  ].filter(Boolean);
  return {
    ...original,
    name: request.name,
    request: {
      ...(original.request ?? {}),
      method: request.method,
      header: request.headers.map((header) => ({ key: header.name, value: header.value, disabled: !header.enabled, type: 'text' })),
      auth,
      url: {
        ...(typeof original.request?.url === 'object' ? original.request.url : {}),
        raw: request.url,
        query: (request.params ?? []).map((param) => ({ key: param.name, value: param.value, disabled: !param.enabled })),
      },
      body,
      description: request.documentation ?? '',
    },
    event,
  };
}

function folderLineage(folders: ApiClientFolder[], folderId: string | null | undefined): ApiClientFolder[] {
  const lineage: ApiClientFolder[] = [];
  const visited = new Set<string>();
  let folder = folders.find((candidate) => candidate.id === folderId);
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id);
    lineage.unshift(folder);
    folder = folders.find((candidate) => candidate.id === folder?.parentId);
  }
  return lineage;
}

export function serializePostmanCollection(title: string, payload: ApiClientNodePayload): Record<string, unknown> {
  const folders = payload.folders ?? [];
  const items: PostmanItem[] = [];
  const requests = [...(payload.requests ?? [])].sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
  for (const request of requests) {
    let level = items;
    const persistedLineage = folderLineage(folders, request.folderId);
    const lineage = persistedLineage.length
      ? persistedLineage
      : (request.folder || '').split('/').map((part, sequence) => ({ id: `legacy-${sequence}-${part}`, name: part.trim(), parentId: null, sequence } as ApiClientFolder)).filter((folder) => folder.name);
    for (const folder of lineage) {
      let entry = level.find((item) => item.name === folder.name && item.item);
      if (!entry) {
        const original = folder.sourceData?.kind === 'postman'
          ? structuredClone(folder.sourceData.data) as PostmanItem
          : {} as PostmanItem;
        entry = { ...original, name: folder.name, item: [] };
        level.push(entry);
      }
      level = entry.item!;
    }
    level.push(requestItem(request));
  }
  const originalCollection = payload.sourceKind === 'postman' && payload.sourceCollection
    ? structuredClone(payload.sourceCollection)
    : {};
  return {
    ...originalCollection,
    info: { ...((originalCollection as any).info ?? {}), name: title, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    variable: Object.entries(payload.variables ?? {}).map(([key, value]) => {
      const original = Array.isArray((originalCollection as any).variable)
        ? (originalCollection as any).variable.find((entry: any) => entry?.key === key)
        : null;
      return { ...(original ?? {}), key, value, disabled: false };
    }),
    item: items,
    event: [
      ...(Array.isArray((originalCollection as any).event) ? (originalCollection as any).event.filter((entry: any) => !['prerequest', 'test'].includes(entry?.listen)) : []),
      payload.collectionPreRequestScript?.trim() ? { listen: 'prerequest', script: { type: 'text/javascript', exec: payload.collectionPreRequestScript.split('\n') } } : null,
      payload.collectionPostResponseScript?.trim() ? { listen: 'test', script: { type: 'text/javascript', exec: payload.collectionPostResponseScript.split('\n') } } : null,
    ].filter(Boolean),
  };
}

export function postmanCollectionFilename(title: string): string {
  return `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'collection'}.postman_collection.json`;
}
