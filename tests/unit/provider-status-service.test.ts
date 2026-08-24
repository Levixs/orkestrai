import { describe, expect, it, vi } from 'vitest';
import { ProviderStatusService } from '$lib/modules/agent-room/application/services/ProviderStatusService.js';

function fakeFetch(handler: (url: string) => Promise<Response>): typeof fetch {
  return vi.fn(handler) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

describe('ProviderStatusService', () => {
  it('reads the Statuspage.io summary and maps indicator/incidents', async () => {
    const svc = new ProviderStatusService(fakeFetch(async () => jsonResponse({
      status: { indicator: 'minor', description: 'Degraded performance' },
      incidents: [{ name: 'Elevated errors', shortlink: 'https://status.example/1' }],
    })));
    const status = await svc.getStatus('claude');
    expect(status).toMatchObject({ indicator: 'minor', description: 'Degraded performance', checked: true });
    expect(status.incidents).toEqual([{ name: 'Elevated errors', shortlink: 'https://status.example/1' }]);
  });

  it('returns an empty unknown status for a provider with no status source', async () => {
    const svc = new ProviderStatusService(fakeFetch(async () => jsonResponse({})));
    const status = await svc.getStatus('opencode');
    expect(status).toMatchObject({ indicator: 'none', checked: false });
  });

  it('falls back to an explicitly unchecked status when the fetch fails, without throwing', async () => {
    const svc = new ProviderStatusService(fakeFetch(async () => jsonResponse({}, false)));
    const status = await svc.getStatus('codex');
    expect(status).toMatchObject({ indicator: 'none', checked: false });
  });

  it('normalizes unexpected external values and drops unsafe incident links', async () => {
    const svc = new ProviderStatusService(fakeFetch(async () => jsonResponse({
      status: { indicator: 'unknown-value', description: 42 },
      incidents: [
        { name: 'Unsafe', shortlink: 'javascript:alert(1)' },
        { name: 'Valid', shortlink: 'https://status.example/incidents/1' },
        { name: 42, shortlink: 'https://status.example/incidents/2' },
      ],
    })));
    const status = await svc.getStatus('claude');
    expect(status).toMatchObject({ indicator: 'none', description: '', checked: true });
    expect(status.incidents).toEqual([{ name: 'Valid', shortlink: 'https://status.example/incidents/1' }]);
  });

  it('caches within the TTL and only refetches when forced or expired', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse({ status: { indicator: 'none' } }));
    const svc = new ProviderStatusService(fetchFn, 60_000);
    await svc.getStatus('claude');
    await svc.getStatus('claude');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await svc.getStatus('claude', true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
