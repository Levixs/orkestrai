import { readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { ApiClientNodePayload, ApiClientRequest } from '../../domain/types.js';
import { createApiClientCookieJar, serializeApiClientCookies } from './ApiClientHttpTransport.js';

export type ApiClientTransportMessage = {
  direction: 'sent' | 'received';
  type: 'text' | 'json' | 'binary';
  content: string;
  at: string;
};

export type ApiClientTransportResult = {
  status: number;
  statusText: string;
  ok: boolean;
  durationMs: number;
  size: number;
  contentType: string;
  headers: Record<string, string>;
  body: string;
  binary: boolean;
  protocol: 'websocket' | 'grpc';
  messages: ApiClientTransportMessage[];
  cookies?: NetworkSettings['cookies'];
};

type NetworkSettings = NonNullable<ApiClientNodePayload['network']>;

async function readCredential(path: string): Promise<Buffer | undefined> {
  if (!path.trim()) return undefined;
  const info = await stat(path);
  if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('Certificate file is invalid or exceeds 2 MB.');
  return readFile(path);
}

function websocketHeaders(request: ApiClientRequest, variables: Record<string, string>): Record<string, string> {
  const render = (value: string) => value.replace(/{{\s*([^{}]+?)\s*}}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match
  );
  const headers = Object.fromEntries((request.headers ?? [])
    .filter((header) => header.enabled && header.name.trim())
    .map((header) => [header.name.trim(), render(header.value)]));
  if (request.auth.type === 'bearer' && request.auth.token && !Object.keys(headers).some((name) => name.toLowerCase() === 'authorization')) {
    headers.Authorization = `Bearer ${render(request.auth.token)}`;
  } else if (request.auth.type === 'basic' && !Object.keys(headers).some((name) => name.toLowerCase() === 'authorization')) {
    headers.Authorization = `Basic ${Buffer.from(`${render(request.auth.username)}:${render(request.auth.password)}`).toString('base64')}`;
  } else if (request.auth.type === 'apiKey' && request.auth.placement !== 'query' && request.auth.key?.trim()) {
    headers[request.auth.key.trim()] = render(request.auth.value ?? '');
  } else if (request.auth.type === 'oauth2' && request.auth.oauth2?.accessToken) {
    headers.Authorization = `${request.auth.oauth2.tokenType || 'Bearer'} ${render(request.auth.oauth2.accessToken)}`;
  }
  return headers;
}

export async function executeWebSocketTransport(input: {
  request: ApiClientRequest;
  url: string;
  variables: Record<string, string>;
  timeoutMs: number;
  network: NetworkSettings;
}): Promise<ApiClientTransportResult> {
  const startedAt = performance.now();
  const configured = input.request.websocket;
  const outgoing = (configured?.messages ?? []).filter((message) => message.enabled);
  const attempts = configured?.autoReconnect ? Math.max(1, (configured.reconnectAttempts ?? 0) + 1) : 1;
  let lastError: Error | null = null;
  const ca = await readCredential(input.network.caPath);
  const cert = await readCredential(input.network.clientCertificatePath);
  const key = await readCredential(input.network.clientKeyPath);
  const pfx = await readCredential(input.network.clientPfxPath);
  const proxyAgent = input.network.proxyUrl ? new HttpsProxyAgent(input.network.proxyUrl) : undefined;
  const jar = await createApiClientCookieJar(input.network);
  const websocketUrl = new URL(input.url);
  const baseHeaders = websocketHeaders(input.request, input.variables);
  if (input.network.cookieJarEnabled && !Object.keys(baseHeaders).some((name) => name.toLowerCase() === 'cookie')) {
    const cookie = await jar.getCookieString(websocketUrl.toString());
    if (cookie) baseHeaders.Cookie = cookie;
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await new Promise<ApiClientTransportResult>((resolve, reject) => {
        const messages: ApiClientTransportMessage[] = [];
        const responseHeaders: Record<string, string> = {};
        let size = 0;
        let opened = false;
        let settled = false;
        let quietTimer: ReturnType<typeof setTimeout> | null = null;
        let keepAlive: ReturnType<typeof setInterval> | null = null;
        const protocols = configured?.protocols?.filter(Boolean) ?? [];
        const cookieUpdates: Promise<unknown>[] = [];
        const socket = new WebSocket(input.url, protocols.length ? protocols : undefined, {
          headers: baseHeaders,
          rejectUnauthorized: input.network.rejectUnauthorized,
          ca,
          cert,
          key,
          pfx,
          passphrase: input.network.clientKeyPassphrase || undefined,
          agent: proxyAgent,
          handshakeTimeout: input.timeoutMs,
        });

        const cleanup = () => {
          if (quietTimer) clearTimeout(quietTimer);
          if (keepAlive) clearInterval(keepAlive);
          clearTimeout(timeout);
        };
        const finish = async () => {
          if (settled) return;
          settled = true;
          cleanup();
          if (socket.readyState === WebSocket.OPEN) socket.close(1000);
          await Promise.all(cookieUpdates);
          const received = messages.filter((message) => message.direction === 'received');
          resolve({
            status: 101,
            statusText: 'Switching Protocols',
            ok: true,
            durationMs: Math.round(performance.now() - startedAt),
            size,
            contentType: 'application/websocket-events+json',
            headers: responseHeaders,
            body: JSON.stringify(received, null, 2),
            binary: false,
            protocol: 'websocket',
            messages,
            cookies: await serializeApiClientCookies(jar, websocketUrl.hostname),
          });
        };
        const scheduleFinish = () => {
          if (quietTimer) clearTimeout(quietTimer);
          quietTimer = setTimeout(finish, outgoing.length ? 650 : 1_000);
        };
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            cleanup();
            socket.terminate();
            reject(new Error('WebSocket request timed out.'));
          }
        }, input.timeoutMs);

        socket.on('upgrade', (response) => {
          for (const [name, value] of Object.entries(response.headers)) responseHeaders[name] = Array.isArray(value) ? value.join(', ') : String(value ?? '');
          if (input.network.cookieJarEnabled) {
            for (const value of response.headersDistinct?.['set-cookie'] ?? []) cookieUpdates.push(jar.setCookie(value, websocketUrl.toString(), { ignoreError: true }));
          }
        });
        socket.on('open', () => {
          opened = true;
          if ((configured?.keepAliveIntervalMs ?? 0) > 0) {
            keepAlive = setInterval(() => socket.readyState === WebSocket.OPEN && socket.ping(), configured!.keepAliveIntervalMs);
          }
          for (const message of outgoing) {
            const rendered = message.content.replace(/{{\s*([^{}]+?)\s*}}/g, (match, name) =>
              Object.prototype.hasOwnProperty.call(input.variables, name) ? input.variables[name] : match
            );
            const data = message.type === 'binary' ? Buffer.from(rendered, 'base64') : rendered;
            socket.send(data);
            size += Buffer.byteLength(data);
            messages.push({ direction: 'sent', type: message.type, content: rendered, at: new Date().toISOString() });
          }
          scheduleFinish();
        });
        socket.on('message', (data, isBinary) => {
          const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          size += buffer.byteLength;
          if (size > 2 * 1024 * 1024) {
            socket.terminate();
            reject(new Error('WebSocket transcript exceeds the 2 MB preview limit.'));
            return;
          }
          const content = isBinary ? buffer.toString('base64') : buffer.toString('utf8');
          let type: ApiClientTransportMessage['type'] = isBinary ? 'binary' : 'text';
          if (!isBinary) {
            try { JSON.parse(content); type = 'json'; } catch { /* Plain text message. */ }
          }
          messages.push({ direction: 'received', type, content, at: new Date().toISOString() });
          scheduleFinish();
        });
        socket.on('error', (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        });
        socket.on('close', (code, reason) => {
          if (settled) return;
          if (opened) void finish();
          else {
            settled = true;
            cleanup();
            reject(new Error(`WebSocket closed during handshake (${code}${reason.length ? `: ${reason.toString()}` : ''}).`));
          }
        });
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('WebSocket connection failed.');
    }
  }
  throw lastError ?? new Error('WebSocket connection failed.');
}

function objectAtPath(root: grpc.GrpcObject, path: string): any {
  return path.split('.').filter(Boolean).reduce<any>((current, segment) => current?.[segment], root);
}

function parseGrpcMessage(content: string): Record<string, unknown> {
  if (!content.trim()) return {};
  const value = JSON.parse(content);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Each gRPC message must be a JSON object.');
  return value as Record<string, unknown>;
}

export async function executeGrpcTransport(input: {
  request: ApiClientRequest;
  url: string;
  variables: Record<string, string>;
  timeoutMs: number;
  network: NetworkSettings;
}): Promise<ApiClientTransportResult> {
  const startedAt = performance.now();
  const config = input.request.grpc;
  if (!config?.protoPath || !config.service || !config.method) throw new Error('gRPC requires a proto file, service, and method.');
  const info = await stat(config.protoPath);
  if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('The proto file is invalid or exceeds 10 MB.');
  const definition = await protoLoader.load(config.protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [dirname(config.protoPath)],
  });
  const root = grpc.loadPackageDefinition(definition);
  const Service = objectAtPath(root, config.service);
  if (typeof Service !== 'function' || !Service.service) throw new Error(`gRPC service not found: ${config.service}`);
  const methodName = Object.keys(Service.service).find((name) => name.toLowerCase() === config.method.toLowerCase());
  if (!methodName) throw new Error(`gRPC method not found: ${config.service}.${config.method}`);
  const methodDefinition = Service.service[methodName];
  const rootCert = await readCredential(input.network.caPath);
  const clientCert = await readCredential(input.network.clientCertificatePath);
  const clientKey = await readCredential(input.network.clientKeyPath);
  const channelCredentials = config.useTls
    ? grpc.credentials.createSsl(rootCert, clientKey, clientCert)
    : grpc.credentials.createInsecure();
  const options: Record<string, unknown> = {};
  if (input.network.proxyUrl) {
    options['grpc.enable_http_proxy'] = 1;
    options['grpc.http_proxy'] = input.network.proxyUrl;
  }
  const client = new Service(input.url.replace(/^grpcs?:\/\//, ''), channelCredentials, options);
  const metadata = new grpc.Metadata();
  for (const [name, value] of Object.entries(websocketHeaders(input.request, input.variables))) metadata.add(name, value);
  const outgoing = (config.messages ?? []).filter((message) => message.enabled).map((message) => parseGrpcMessage(message.content));
  if (!outgoing.length) outgoing.push({});
  const received: unknown[] = [];
  let statusCode = grpc.status.OK;
  let statusText = 'OK';
  const callOptions = { deadline: new Date(Date.now() + input.timeoutMs) };

  try {
    await new Promise<void>((resolve, reject) => {
      const done = (error?: grpc.ServiceError | null, response?: unknown) => {
        if (error) { statusCode = error.code; statusText = error.details || error.message; reject(error); return; }
        if (response !== undefined) received.push(response);
        resolve();
      };
      if (!methodDefinition.requestStream && !methodDefinition.responseStream) {
        client[methodName](outgoing[0], metadata, callOptions, done);
        return;
      }
      if (!methodDefinition.requestStream && methodDefinition.responseStream) {
        const call = client[methodName](outgoing[0], metadata, callOptions);
        call.on('data', (message: unknown) => received.push(message));
        call.on('status', (status: grpc.StatusObject) => { statusCode = status.code; statusText = status.details || grpc.status[status.code]; });
        call.on('error', reject);
        call.on('end', resolve);
        return;
      }
      if (methodDefinition.requestStream && !methodDefinition.responseStream) {
        const call = client[methodName](metadata, callOptions, done);
        for (const message of outgoing) call.write(message);
        call.end();
        return;
      }
      const call = client[methodName](metadata, callOptions);
      call.on('data', (message: unknown) => received.push(message));
      call.on('status', (status: grpc.StatusObject) => { statusCode = status.code; statusText = status.details || grpc.status[status.code]; });
      call.on('error', reject);
      call.on('end', resolve);
      for (const message of outgoing) call.write(message);
      call.end();
    });
  } finally {
    client.close();
  }
  const body = JSON.stringify(received.length === 1 ? received[0] : received, null, 2);
  const messages: ApiClientTransportMessage[] = [
    ...outgoing.map((message) => ({ direction: 'sent' as const, type: 'json' as const, content: JSON.stringify(message, null, 2), at: new Date().toISOString() })),
    ...received.map((message) => ({ direction: 'received' as const, type: 'json' as const, content: JSON.stringify(message, null, 2), at: new Date().toISOString() })),
  ];
  return {
    status: statusCode,
    statusText,
    ok: statusCode === grpc.status.OK,
    durationMs: Math.round(performance.now() - startedAt),
    size: Buffer.byteLength(body),
    contentType: 'application/grpc+json',
    headers: {},
    body,
    binary: false,
    protocol: 'grpc',
    messages,
  };
}
