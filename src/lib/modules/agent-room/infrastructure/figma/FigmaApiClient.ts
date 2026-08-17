const FIGMA_API = 'https://api.figma.com/v1';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_JSON_BYTES = 60 * 1024 * 1024;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const ASSET_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

function sniffAssetMimeType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'GIF8') return 'image/gif';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  const prefix = new TextDecoder().decode(bytes.slice(0, 256)).trimStart();
  if (prefix.startsWith('<svg') || (prefix.startsWith('<?xml') && prefix.includes('<svg'))) return 'image/svg+xml';
  return null;
}

export type FigmaApiNode = Record<string, unknown> & {
  id: string;
  name: string;
  type: string;
  children?: FigmaApiNode[];
};

export type FigmaFilePayload = {
  name: string;
  version?: string;
  lastModified?: string;
  document: FigmaApiNode;
  components?: Record<string, Record<string, unknown>>;
  componentSets?: Record<string, Record<string, unknown>>;
  styles?: Record<string, Record<string, unknown>>;
};

export type FigmaNodesPayload = {
  name?: string;
  version?: string;
  lastModified?: string;
  nodes: Record<string, {
    document: FigmaApiNode | null;
    components?: Record<string, Record<string, unknown>>;
    componentSets?: Record<string, Record<string, unknown>>;
    styles?: Record<string, Record<string, unknown>>;
  } | null>;
};

export class FigmaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: 'unauthorized' | 'forbidden' | 'rate_limited' | 'not_found' | 'invalid' | 'unavailable',
  ) {
    super(message);
    this.name = 'FigmaApiError';
  }
}

export class FigmaApiClient {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async me(token: string): Promise<{ id: string; handle: string; email: string; imgUrl: string | null }> {
    const payload = await this.json<Record<string, unknown>>('/me', token);
    return {
      id: String(payload.id ?? ''),
      handle: String(payload.handle ?? ''),
      email: String(payload.email ?? ''),
      imgUrl: typeof payload.img_url === 'string' ? payload.img_url : null,
    };
  }

  async file(fileKey: string, token: string, depth = 2): Promise<FigmaFilePayload> {
    const payload = await this.json<FigmaFilePayload>(`/files/${encodeURIComponent(fileKey)}?depth=${depth}&geometry=paths`, token);
    if (!payload?.document || typeof payload.name !== 'string') throw new FigmaApiError('Figma returned an invalid file.', 502, 'invalid');
    return payload;
  }

  async nodes(fileKey: string, nodeIds: string[], token: string): Promise<FigmaNodesPayload> {
    const ids = [...new Set(nodeIds)].join(',');
    const payload = await this.json<FigmaNodesPayload>(`/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(ids)}&geometry=paths`, token);
    if (!payload?.nodes || typeof payload.nodes !== 'object') throw new FigmaApiError('Figma returned invalid nodes.', 502, 'invalid');
    return payload;
  }

  async localVariables(fileKey: string, token: string): Promise<Record<string, unknown> | null> {
    try {
      return await this.json<Record<string, unknown>>(`/files/${encodeURIComponent(fileKey)}/variables/local`, token);
    } catch (error) {
      if (error instanceof FigmaApiError && (error.status === 403 || error.status === 404)) return null;
      throw error;
    }
  }

  async imageFills(fileKey: string, token: string): Promise<Record<string, string>> {
    try {
      const payload = await this.json<{ meta?: { images?: Record<string, string> } }>(`/files/${encodeURIComponent(fileKey)}/images`, token);
      return payload.meta?.images ?? {};
    } catch (error) {
      if (error instanceof FigmaApiError && (error.status === 403 || error.status === 404)) return {};
      throw error;
    }
  }

  async downloadAsset(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new FigmaApiError('Figma asset URL must use HTTPS.', 400, 'invalid');
    const response = await this.fetchFn(parsed, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'follow' });
    if (!response.ok) throw this.error(response.status, 'Could not download the Figma asset.');
    if (response.url && new URL(response.url).protocol !== 'https:') throw new FigmaApiError('Figma asset redirect must use HTTPS.', 400, 'invalid');
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_ASSET_BYTES) throw new FigmaApiError('Figma asset exceeds the 20 MB limit.', 413, 'invalid');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw new FigmaApiError('Figma asset is empty or too large.', 413, 'invalid');
    const declared = response.headers.get('content-type')?.split(';')[0]?.toLowerCase() ?? '';
    const mimeType = ASSET_MIME_TYPES.has(declared) ? declared : sniffAssetMimeType(bytes);
    if (!mimeType) throw new FigmaApiError('Figma returned an unsupported asset type.', 415, 'invalid');
    return { bytes, mimeType };
  }

  private async json<T>(path: string, token: string): Promise<T> {
    if (!token.trim()) throw new FigmaApiError('Figma credential is missing.', 401, 'unauthorized');
    const response = await this.fetchFn(`${FIGMA_API}${path}`, {
      headers: { 'X-Figma-Token': token.trim(), accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw this.error(response.status, `Figma request failed (${response.status}).`);
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_JSON_BYTES) throw new FigmaApiError('Figma response is too large.', 413, 'invalid');
    const text = await response.text();
    if (text.length > MAX_JSON_BYTES) throw new FigmaApiError('Figma response is too large.', 413, 'invalid');
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new FigmaApiError('Figma returned invalid JSON.', 502, 'invalid');
    }
  }

  private error(status: number, fallback: string): FigmaApiError {
    if (status === 401) return new FigmaApiError('Figma credential is invalid or expired.', status, 'unauthorized');
    if (status === 403) return new FigmaApiError('Figma denied access to this file or capability.', status, 'forbidden');
    if (status === 404) return new FigmaApiError('Figma file or node was not found.', status, 'not_found');
    if (status === 429) return new FigmaApiError('Figma rate limit reached. Try again later.', status, 'rate_limited');
    return new FigmaApiError(fallback, status, 'unavailable');
  }
}

export const figmaApiClient = new FigmaApiClient();
