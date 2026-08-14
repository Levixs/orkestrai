import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { USAGE_REFRESH_INTERVAL_MS } from '$lib/modules/agent-room/domain/usage.js';

const FETCH_TIMEOUT_MS = 10_000;
/** OAuth do kimi-code (client publico da CLI). */
const KIMI_OAUTH_TOKEN_URL = 'https://auth.kimi.com/api/oauth/token';
const KIMI_OAUTH_CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098';

export type UsageWindowKind = '5h' | 'weekly' | 'monthly';

export type UsageWindow = {
  kind: UsageWindowKind;
  label: string;
  /** 0-100 */
  usedPercent: number;
  resetsAt: string | null;
};

export type ProviderUsage = {
  provider: 'claude' | 'codex' | 'kimi';
  plan: string | null;
  windows: UsageWindow[];
  error: string | null;
  fetchedAt: string;
};

const WINDOW_LABELS: Record<UsageWindowKind, string> = {
  '5h': '5 horas',
  weekly: 'Semanal',
  monthly: 'Mensal',
};

function windowOf(kind: UsageWindowKind, usedPercent: number, resetsAt: string | null): UsageWindow {
  return { kind, label: WINDOW_LABELS[kind], usedPercent: Math.max(0, Math.min(100, Math.round(usedPercent))), resetsAt };
}

/** Mantem uma unica barra por periodo, usando a cota mais pressionada. */
function mergeWindow(windows: UsageWindow[], next: UsageWindow): void {
  const index = windows.findIndex((window) => window.kind === next.kind);
  if (index < 0) {
    windows.push(next);
    return;
  }
  if (next.usedPercent > windows[index].usedPercent) windows[index] = next;
}

function kindFromSeconds(seconds: number): UsageWindowKind {
  if (seconds <= 5.5 * 3600) return '5h';
  if (seconds <= 8 * 24 * 3600) return 'weekly';
  return 'monthly';
}

/**
 * Uso/cota dos providers (Claude, Codex, Kimi) lido DIRETO das APIs de cada
 * um, com as credenciais locais da propria CLI — nada para o usuario
 * configurar. Cache alinhado ao intervalo automatico do painel.
 */
export class UsageService {
  private cache = new Map<string, { at: number; usage: ProviderUsage }>();

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly home: string = homedir(),
    private readonly keychainReader: (service: string) => Promise<string | null> = readMacOsKeychain,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async getAll(forceRefresh = false): Promise<ProviderUsage[]> {
    return Promise.all(['claude', 'codex', 'kimi'].map((provider) => this.getUsage(provider, forceRefresh)));
  }

  cached(): ProviderUsage[] {
    return ['claude', 'codex', 'kimi']
      .map((provider) => this.cache.get(provider)?.usage ?? null)
      .filter((usage): usage is ProviderUsage => Boolean(usage));
  }

  async getUsage(provider: string, forceRefresh = false): Promise<ProviderUsage> {
    const cached = this.cache.get(provider);
    if (!forceRefresh && cached && Date.now() - cached.at < USAGE_REFRESH_INTERVAL_MS) return cached.usage;

    let usage: ProviderUsage;
    try {
      if (provider === 'claude') usage = await this.claudeUsage();
      else if (provider === 'codex') usage = await this.codexUsage();
      else if (provider === 'kimi') usage = await this.kimiUsage();
      else usage = this.failure(provider, 'Provider desconhecido.');
    } catch (error) {
      usage = this.failure(provider, error instanceof Error ? error.message : 'Falha ao consultar uso.');
    }
    this.cache.set(provider, { at: Date.now(), usage });
    return usage;
  }

  private failure(provider: string, error: string): ProviderUsage {
    return { provider: provider as ProviderUsage['provider'], plan: null, windows: [], error, fetchedAt: new Date().toISOString() };
  }

  // -- Claude (OAuth do Claude Code; token no arquivo ou no Keychain do macOS) --

  private async claudeToken(): Promise<string> {
    const filePath = join(this.home, '.claude', '.credentials.json');
    if (existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      const token = parsed?.claudeAiOauth?.accessToken;
      if (token) return token as string;
    }
    if (this.platform === 'darwin') {
      const raw = await this.keychainReader('Claude Code-credentials');
      if (raw) {
        const token = JSON.parse(raw)?.claudeAiOauth?.accessToken;
        if (token) return token as string;
      }
    }
    throw new Error('Credenciais do Claude Code nao encontradas.');
  }

  private async claudeUsage(): Promise<ProviderUsage> {
    const token = await this.claudeToken();
    const data = await this.fetchJson('https://api.anthropic.com/api/oauth/usage', {
      authorization: `Bearer ${token}`,
      'anthropic-beta': 'oauth-2025-04-20',
    });
    const windows: UsageWindow[] = [];
    const fiveHour = data?.five_hour as { utilization?: number; resets_at?: string } | null;
    const sevenDay = data?.seven_day as { utilization?: number; resets_at?: string } | null;
    if (fiveHour) windows.push(windowOf('5h', Number(fiveHour.utilization ?? 0), fiveHour.resets_at ?? null));
    if (sevenDay) windows.push(windowOf('weekly', Number(sevenDay.utilization ?? 0), sevenDay.resets_at ?? null));
    return { provider: 'claude', plan: null, windows, error: null, fetchedAt: new Date().toISOString() };
  }

  // -- Codex (ChatGPT backend; auth.json do codex CLI) --

  private async codexUsage(): Promise<ProviderUsage> {
    const filePath = join(this.home, '.codex', 'auth.json');
    if (!existsSync(filePath)) throw new Error('auth.json do Codex nao encontrado.');
    const auth = JSON.parse(readFileSync(filePath, 'utf8'));
    const token = auth?.tokens?.access_token;
    if (!token) throw new Error('Token do Codex ausente no auth.json.');

    const data = await this.fetchJson('https://chatgpt.com/backend-api/wham/usage', {
      authorization: `Bearer ${token}`,
      'chatgpt-account-id': String(auth?.tokens?.account_id ?? ''),
    });
    const windows: UsageWindow[] = [];
    const rateLimits = [data?.rate_limit];
    const additional = Array.isArray(data?.additional_rate_limits)
      ? data.additional_rate_limits as Array<{ rate_limit?: unknown }>
      : [];
    rateLimits.push(...additional.map((entry) => entry.rate_limit));
    for (const rateLimit of rateLimits) {
      for (const key of ['primary_window', 'secondary_window'] as const) {
        const win = (rateLimit as Record<string, unknown> | null)?.[key] as {
          used_percent?: number;
          limit_window_seconds?: number;
          reset_at?: number;
        } | null;
        if (!win) continue;
        const seconds = Number(win.limit_window_seconds ?? 0);
        if (!Number.isFinite(seconds) || seconds <= 0) continue;
        const kind = kindFromSeconds(seconds);
        mergeWindow(windows, windowOf(
          kind,
          Number(win.used_percent ?? 0),
          win.reset_at ? new Date(win.reset_at * 1000).toISOString() : null,
        ));
      }
    }
    const plan = typeof data?.plan_type === 'string' ? (data.plan_type as string) : null;
    return {
      provider: 'codex',
      plan: plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : null,
      windows,
      error: null,
      fetchedAt: new Date().toISOString(),
    };
  }

  // -- Kimi (kimi-code; /coding/v1/usages) --

  /**
   * Token OAuth do kimi-code: expira em 15 min e o refresh ROTACIONA (vem um
   * refresh_token novo — precisa persistir os dois, senao o da CLI morre).
   * Sem isso o usage so funcionava logo depois de abrir a CLI do kimi.
   */
  private async kimiToken(filePath: string): Promise<string> {
    const creds = JSON.parse(readFileSync(filePath, 'utf8')) as {
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };
    if (!creds.access_token) throw new Error('Token do kimi-code ausente.');
    // Sem expires_at registrado: usa o token como esta (so renova quando sabe que venceu).
    const expiresAtMs = Number(creds.expires_at ?? 0) * 1000; // expires_at e em SEGUNDOS
    if (!creds.expires_at || expiresAtMs > Date.now() + 60_000) return creds.access_token;
    if (!creds.refresh_token) throw new Error('Refresh token do kimi-code ausente — abra a CLI e faca login.');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token,
      client_id: KIMI_OAUTH_CLIENT_ID,
    });
    const response = await this.fetchFn(KIMI_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Refresh do kimi falhou (HTTP ${response.status}) — abra a CLI e faca login.`);
    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope?: string;
      token_type?: string;
    };
    const next = {
      ...creds,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
      expires_in: data.expires_in,
      scope: data.scope ?? creds.scope,
      token_type: data.token_type ?? 'Bearer',
    };
    writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`);
    return data.access_token;
  }

  private async kimiUsage(): Promise<ProviderUsage> {
    const filePath = join(this.home, '.kimi-code', 'credentials', 'kimi-code.json');
    if (!existsSync(filePath)) throw new Error('Credenciais do kimi-code nao encontradas.');
    const token = await this.kimiToken(filePath);

    const data = await this.fetchJson('https://api.kimi.com/coding/v1/usages', {
      authorization: `Bearer ${token}`,
    });
    const windows: UsageWindow[] = [];
    const limits = Array.isArray(data?.limits) ? (data.limits as Array<Record<string, unknown>>) : [];
    for (const entry of limits) {
      const win = entry?.window as { duration?: number; timeUnit?: string } | undefined;
      const detail = entry?.detail as { limit?: string; used?: string; remaining?: string; resetTime?: string } | undefined;
      if (!win || !detail) continue;
      const minutes = Number(win.duration ?? 0) * (String(win.timeUnit).includes('HOUR') ? 60 : 1);
      if (!Number.isFinite(minutes) || minutes <= 0 || (detail.used === undefined && detail.remaining === undefined)) continue;
      const kind = kindFromSeconds(minutes * 60);
      mergeWindow(windows, windowOf(kind, percentOfUsage(detail), detail.resetTime ?? null));
    }
    const weekly = data?.usage as { limit?: string; used?: string; remaining?: string; resetTime?: string } | undefined;
    if (weekly && (weekly.used !== undefined || weekly.remaining !== undefined)) {
      mergeWindow(windows, windowOf('weekly', percentOfUsage(weekly), weekly.resetTime ?? null));
    }

    const level = (data?.user as { membership?: { level?: string } } | undefined)?.membership?.level ?? null;
    const plan = level ? level.replace(/^LEVEL_/, '').charAt(0).toUpperCase() + level.replace(/^LEVEL_/, '').slice(1).toLowerCase() : null;
    return { provider: 'kimi', plan, windows, error: null, fetchedAt: new Date().toISOString() };
  }

  private async fetchJson(url: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await this.fetchFn(url, { headers, signal: controller.signal });
      if (response.status === 401 || response.status === 403) {
        throw new Error('Credencial expirada — abra a CLI do provider e faca login de novo.');
      }
      if (!response.ok) throw new Error(`API respondeu HTTP ${response.status}.`);
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('API demorou demais para responder.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function percentOfUsage(value: { used?: string; remaining?: string; limit?: string }): number {
  const limitNum = Number(value.limit ?? 0);
  if (!limitNum) return 0;
  const usedNum = value.used === undefined
    ? Math.max(0, limitNum - Number(value.remaining ?? limitNum))
    : Number(value.used);
  return (usedNum / limitNum) * 100;
}

/** Le uma entrada do Keychain do macOS (ex.: credenciais do Claude Code). */
async function readMacOsKeychain(service: string): Promise<string | null> {
  try {
    const exec = promisify(execFile);
    const { stdout } = await exec('security', ['find-generic-password', '-s', service, '-w'], { timeout: 10_000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export const usageService = new UsageService();
