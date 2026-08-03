import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UsageService } from '$lib/modules/agent-room/application/services/UsageService.js';

function fakeFetch(routes: Record<string, unknown>) {
  return (async (url: string) => {
    const body = routes[url];
    if (!body) return { ok: false, status: 404, json: async () => ({}) } as Response;
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
}

function homeWith(files: Record<string, string>): string {
  const home = mkdtempSync(join(tmpdir(), 'orkestrai-usage-'));
  for (const [path, contents] of Object.entries(files)) {
    const full = join(home, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, contents);
  }
  return home;
}

const CLAUDE_USAGE = {
  five_hour: { utilization: 42, resets_at: '2026-08-02T18:00:00Z' },
  seven_day: { utilization: 10, resets_at: '2026-08-05T00:00:00Z' },
};

const CODEX_USAGE = {
  plan_type: 'pro',
  rate_limit: {
    primary_window: { used_percent: 55, limit_window_seconds: 18000, reset_at: 1785600000 },
    secondary_window: { used_percent: 20, limit_window_seconds: 604800, reset_at: 1786200000 },
  },
};

const KIMI_USAGE = {
  user: { membership: { level: 'LEVEL_ALLEGRO' } },
  usage: { limit: '100', used: '39', resetTime: '2026-08-04T10:00:00Z' },
  limits: [
    { window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: '100', used: '7', resetTime: '2026-08-02T15:00:00Z' } },
  ],
};

describe('UsageService', () => {
  it('claude: le credencial do arquivo e normaliza 5h + semanal', async () => {
    const home = homeWith({ '.claude/.credentials.json': JSON.stringify({ claudeAiOauth: { accessToken: 'tok' } }) });
    const service = new UsageService(fakeFetch({ 'https://api.anthropic.com/api/oauth/usage': CLAUDE_USAGE }), home, async () => null);

    const usage = await service.getUsage('claude');
    expect(usage.error).toBeNull();
    expect(usage.windows).toHaveLength(2);
    expect(usage.windows[0]).toMatchObject({ kind: '5h', label: '5 horas', usedPercent: 42 });
    expect(usage.windows[1]).toMatchObject({ kind: 'weekly', usedPercent: 10, resetsAt: '2026-08-05T00:00:00Z' });
  });

  it('claude: cai no Keychain quando o arquivo nao existe', async () => {
    const home = homeWith({});
    const service = new UsageService(fakeFetch({ 'https://api.anthropic.com/api/oauth/usage': CLAUDE_USAGE }), home, async () =>
      JSON.stringify({ claudeAiOauth: { accessToken: 'tok-keychain' } })
    );
    const usage = await service.getUsage('claude');
    expect(usage.error).toBeNull();
    expect(usage.windows[0].usedPercent).toBe(42);
  });

  it('claude: sem credencial retorna erro amigavel', async () => {
    const service = new UsageService(fakeFetch({}), homeWith({}), async () => null);
    const usage = await service.getUsage('claude');
    expect(usage.error).toContain('Credenciais do Claude Code');
    expect(usage.windows).toHaveLength(0);
  });

  it('codex: mapeia janelas 5h/semanal pelos segundos e o plano', async () => {
    const home = homeWith({ '.codex/auth.json': JSON.stringify({ tokens: { access_token: 'tok', account_id: 'acc' } }) });
    const service = new UsageService(fakeFetch({ 'https://chatgpt.com/backend-api/wham/usage': CODEX_USAGE }), home);

    const usage = await service.getUsage('codex');
    expect(usage.error).toBeNull();
    expect(usage.plan).toBe('Pro');
    expect(usage.windows[0]).toMatchObject({ kind: '5h', usedPercent: 55 });
    expect(usage.windows[1]).toMatchObject({ kind: 'weekly', usedPercent: 20 });
    expect(usage.windows[0].resetsAt).toBe(new Date(1785600000 * 1000).toISOString());
  });

  it('kimi: janela de 300min vira 5h, usage vira semanal, level vira plano', async () => {
    const home = homeWith({ '.kimi-code/credentials/kimi-code.json': JSON.stringify({ access_token: 'tok' }) });
    const service = new UsageService(fakeFetch({ 'https://api.kimi.com/coding/v1/usages': KIMI_USAGE }), home);

    const usage = await service.getUsage('kimi');
    expect(usage.error).toBeNull();
    expect(usage.plan).toBe('Allegro');
    expect(usage.windows[0]).toMatchObject({ kind: '5h', usedPercent: 7 });
    expect(usage.windows[1]).toMatchObject({ kind: 'weekly', usedPercent: 39, resetsAt: '2026-08-04T10:00:00Z' });
  });

  it('401 vira mensagem de credencial expirada', async () => {
    const home = homeWith({ '.codex/auth.json': JSON.stringify({ tokens: { access_token: 'tok' } }) });
    const expired = (async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response) as typeof fetch;
    const service = new UsageService(expired, home);
    const usage = await service.getUsage('codex');
    expect(usage.error).toContain('expirada');
  });

  it('cache: segunda chamada nao refaz o fetch', async () => {
    let calls = 0;
    const counting = (async (url: string) => {
      calls += 1;
      return { ok: true, status: 200, json: async () => CODEX_USAGE } as Response;
    }) as typeof fetch;
    const home = homeWith({ '.codex/auth.json': JSON.stringify({ tokens: { access_token: 'tok' } }) });
    const service = new UsageService(counting, home);
    await service.getUsage('codex');
    await service.getUsage('codex');
    expect(calls).toBe(1);
  });
});
