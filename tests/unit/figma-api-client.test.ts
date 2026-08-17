import { describe, expect, it, vi } from 'vitest';
import { FigmaApiClient, FigmaApiError } from '$lib/modules/agent-room/infrastructure/figma/FigmaApiClient.js';

describe('FigmaApiClient', () => {
  it('uses the fixed official API host and keeps the token in the header', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: '1', handle: 'raoni', email: 'r@example.com', img_url: null }), { status: 200 }));
    const client = new FigmaApiClient(fetchFn as typeof fetch);
    await expect(client.me('secret-token')).resolves.toMatchObject({ handle: 'raoni' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://api.figma.com/v1/me');
    expect((init.headers as Record<string, string>)['X-Figma-Token']).toBe('secret-token');
    expect(String(url)).not.toContain('secret-token');
  });

  it('maps authentication and rate limit failures without leaking response bodies', async () => {
    const unauthorized = new FigmaApiClient((async () => new Response('private details', { status: 401 })) as typeof fetch);
    await expect(unauthorized.me('bad')).rejects.toMatchObject<FigmaApiError>({ code: 'unauthorized', status: 401 });
    const limited = new FigmaApiClient((async () => new Response('{}', { status: 429 })) as typeof fetch);
    await expect(limited.file('AbCdEf123', 'token')).rejects.toMatchObject<FigmaApiError>({ code: 'rate_limited', status: 429 });
  });

  it('treats unavailable enterprise variables as an optional capability', async () => {
    const client = new FigmaApiClient((async () => new Response('{}', { status: 403 })) as typeof fetch);
    await expect(client.localVariables('AbCdEf123', 'token')).resolves.toBeNull();
  });

  it('keeps structural imports available when image fills are forbidden', async () => {
    const client = new FigmaApiClient((async () => new Response('{}', { status: 403 })) as typeof fetch);
    await expect(client.imageFills('AbCdEf123', 'token')).resolves.toEqual({});
  });

  it('sniffs supported image bytes when the CDN omits a useful content type', async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const client = new FigmaApiClient((async () => new Response(Uint8Array.from(bytes).buffer, { status: 200, headers: { 'content-type': 'application/octet-stream' } })) as typeof fetch);
    await expect(client.downloadAsset('https://cdn.figma.com/image')).resolves.toMatchObject({ mimeType: 'image/png' });
  });
});
