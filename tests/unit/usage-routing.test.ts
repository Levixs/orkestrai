import { describe, expect, it } from 'vitest';
import { buildUsageRoutingReport, normalizeUsageRoutingPolicy } from '$lib/modules/agent-room/domain/usage-routing.js';
import type { ProviderUsage } from '$lib/modules/agent-room/application/services/UsageService.js';

const usage = (provider: ProviderUsage['provider'], usedPercent: number, error: ProviderUsage['error'] = null): ProviderUsage => ({
  provider,
  plan: null,
  windows: error ? [] : [{ kind: '5h', label: '5 hours', usedPercent, resetsAt: null }],
  error,
  fetchedAt: new Date(0).toISOString(),
});

describe('usage routing', () => {
  it('recomenda o fallback quando a origem cruza o limite e o destino esta disponivel', () => {
    const report = buildUsageRoutingReport([usage('claude', 94), usage('codex', 20), usage('kimi', 10)], {
      enabled: true,
      sourceProvider: 'claude',
      fallbackProvider: 'codex',
      windowKind: '5h',
      thresholdPercent: 90,
    });
    expect(report.shouldFallback).toBe(true);
    expect(report.recommendedProvider).toBe('codex');
    expect(report.providers.find((provider) => provider.provider === 'claude')?.status).toBe('near_limit');
  });

  it('nao recomenda destino indisponivel nem politica desativada', () => {
    expect(buildUsageRoutingReport([usage('claude', 100), usage('codex', 0, 'credentials_missing')]).shouldFallback).toBe(false);
    expect(buildUsageRoutingReport([usage('claude', 100), usage('codex', 10)], { enabled: false }).shouldFallback).toBe(false);
  });

  it('normaliza limite e providers vindos do payload persistido', () => {
    expect(normalizeUsageRoutingPolicy({ thresholdPercent: 12, sourceProvider: ' claude ', fallbackProvider: ' kimi ' })).toEqual({
      enabled: true,
      sourceProvider: 'claude',
      fallbackProvider: 'kimi',
      windowKind: 'weekly',
      thresholdPercent: 50,
    });
  });

  it('avalia somente a janela escolhida pela politica', () => {
    const providers: ProviderUsage[] = [
      {
        ...usage('claude', 95),
        windows: [
          { kind: '5h', label: '5 hours', usedPercent: 95, resetsAt: null },
          { kind: 'weekly', label: 'Weekly', usedPercent: 30, resetsAt: null },
        ],
      },
      {
        ...usage('codex', 10),
        windows: [
          { kind: '5h', label: '5 hours', usedPercent: 10, resetsAt: null },
          { kind: 'weekly', label: 'Weekly', usedPercent: 10, resetsAt: null },
        ],
      },
    ];

    expect(buildUsageRoutingReport(providers, { windowKind: 'weekly' }).shouldFallback).toBe(false);
    expect(buildUsageRoutingReport(providers, { windowKind: '5h' }).shouldFallback).toBe(true);
  });

  it('marca o provider indisponivel quando ele nao reporta a janela escolhida', () => {
    const report = buildUsageRoutingReport([usage('claude', 20)], { windowKind: 'monthly' });
    expect(report.providers[0].status).toBe('unavailable');
    expect(report.providers[0].monitoredUsedPercent).toBeNull();
  });

  it('nunca mantem origem e fallback iguais', () => {
    expect(normalizeUsageRoutingPolicy({ sourceProvider: 'claude', fallbackProvider: 'claude' })).toMatchObject({
      sourceProvider: 'claude',
      fallbackProvider: 'codex',
    });
    expect(normalizeUsageRoutingPolicy({ sourceProvider: 'codex', fallbackProvider: 'codex' })).toMatchObject({
      sourceProvider: 'codex',
      fallbackProvider: 'claude',
    });
  });
});
