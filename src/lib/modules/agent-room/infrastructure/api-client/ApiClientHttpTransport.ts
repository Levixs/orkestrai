import { readFile, stat } from 'node:fs/promises';
import { Agent, ProxyAgent, fetch, type Dispatcher } from 'undici';
import { CookieJar } from 'tough-cookie';
import type { ApiClientNodePayload } from '../../domain/types.js';
import type { ApiClientScriptResponse } from './ApiClientScriptSandbox.js';

const RESPONSE_LIMIT = 2 * 1024 * 1024;
type NetworkSettings = NonNullable<ApiClientNodePayload['network']>;

async function readCredential(path: string): Promise<Buffer | undefined> {
  if (!path.trim()) return undefined;
  const info = await stat(path);
  if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('Certificate file is invalid or exceeds 2 MB.');
  return readFile(path);
}

async function dispatcher(network: NetworkSettings): Promise<Dispatcher> {
  const connect = {
    rejectUnauthorized: network.rejectUnauthorized,
    ca: await readCredential(network.caPath),
    cert: await readCredential(network.clientCertificatePath),
    key: await readCredential(network.clientKeyPath),
    pfx: await readCredential(network.clientPfxPath),
    passphrase: network.clientKeyPassphrase || undefined,
  };
  return network.proxyUrl.trim()
    ? new ProxyAgent({ uri: network.proxyUrl.trim(), requestTls: connect, proxyTls: connect })
    : new Agent({ connect });
}

export async function createApiClientCookieJar(network: NetworkSettings): Promise<CookieJar> {
  const jar = new CookieJar();
  for (const stored of network.cookies) {
    const host = stored.domain.replace(/^\./, '');
    const attributes = [`${stored.key}=${stored.value}`, `Path=${stored.path || '/'}`];
    if (!stored.hostOnly) attributes.push(`Domain=${stored.domain}`);
    if (stored.expires) attributes.push(`Expires=${new Date(stored.expires).toUTCString()}`);
    if (stored.secure) attributes.push('Secure');
    if (stored.httpOnly) attributes.push('HttpOnly');
    await jar.setCookie(attributes.join('; '), `${stored.secure ? 'https' : 'http'}://${host}${stored.path || '/'}`, { ignoreError: true });
  }
  return jar;
}

export async function serializeApiClientCookies(jar: CookieJar, fallbackDomain: string): Promise<NetworkSettings['cookies']> {
  const serialized = await jar.serialize();
  return serialized.cookies.map((cookie) => ({
    key: String(cookie.key ?? ''),
    value: String(cookie.value ?? ''),
    domain: String(cookie.domain ?? fallbackDomain),
    path: String(cookie.path ?? '/'),
    expires: cookie.expires instanceof Date ? cookie.expires.toISOString() : null,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    hostOnly: cookie.hostOnly !== false,
  }));
}

export async function executeHttpTransport(input: {
  url: URL;
  method: string;
  headers: Headers;
  body?: BodyInit;
  timeoutMs: number;
  followRedirects: boolean;
  network: NetworkSettings;
}): Promise<ApiClientScriptResponse & { cookies: NetworkSettings['cookies'] }> {
  const transport = await dispatcher(input.network);
  const jar = await createApiClientCookieJar(input.network);
  if (input.network.cookieJarEnabled && !input.headers.has('cookie')) {
    const value = await jar.getCookieString(input.url.toString());
    if (value) input.headers.set('cookie', value);
  }
  const startedAt = performance.now();
  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body as any,
      signal: AbortSignal.timeout(input.timeoutMs),
      redirect: input.followRedirects ? 'follow' : 'manual',
      dispatcher: transport,
    });
    if (input.network.cookieJarEnabled) {
      for (const value of response.headers.getSetCookie()) await jar.setCookie(value, response.url || input.url.toString(), { ignoreError: true });
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_LIMIT) {
        await reader.cancel();
        throw new Error('Response exceeds the 2 MB preview limit.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const contentType = response.headers.get('content-type') ?? '';
    const textual = /(?:json|text|xml|javascript|html|urlencoded|graphql)/i.test(contentType);
    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      durationMs: Math.round(performance.now() - startedAt),
      size,
      contentType,
      headers: Object.fromEntries(response.headers.entries()),
      body: textual ? new TextDecoder().decode(bytes) : '',
      binary: !textual,
      cookies: await serializeApiClientCookies(jar, input.url.hostname),
    };
  } finally {
    await transport.close();
  }
}
