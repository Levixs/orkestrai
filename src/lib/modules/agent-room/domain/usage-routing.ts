import type { ProviderUsage, UsageWindowKind } from '../application/services/UsageService.js';

export type UsageRoutingPolicy = {
  enabled: boolean;
  sourceProvider: string;
  fallbackProvider: string;
  windowKind: UsageWindowKind;
  thresholdPercent: number;
};

export type ProviderUsageStatus = 'available' | 'near_limit' | 'exhausted' | 'unavailable';

export type UsageRoutingReport = {
  providers: Array<ProviderUsage & { status: ProviderUsageStatus; monitoredUsedPercent: number | null }>;
  policy: UsageRoutingPolicy;
  shouldFallback: boolean;
  recommendedProvider: string | null;
};

export const DEFAULT_USAGE_ROUTING_POLICY: UsageRoutingPolicy = {
  enabled: true,
  sourceProvider: 'claude',
  fallbackProvider: 'codex',
  windowKind: 'weekly',
  thresholdPercent: 90,
};

export function normalizeUsageRoutingPolicy(value: unknown): UsageRoutingPolicy {
  const input = value && typeof value === 'object' ? value as Partial<UsageRoutingPolicy> : {};
  const threshold = Number(input.thresholdPercent);
  const sourceProvider = String(input.sourceProvider || DEFAULT_USAGE_ROUTING_POLICY.sourceProvider).trim().slice(0, 40);
  const requestedFallback = String(input.fallbackProvider || DEFAULT_USAGE_ROUTING_POLICY.fallbackProvider).trim().slice(0, 40);
  const windowKind = input.windowKind === '5h' || input.windowKind === 'monthly'
    ? input.windowKind
    : DEFAULT_USAGE_ROUTING_POLICY.windowKind;
  return {
    enabled: input.enabled !== false,
    sourceProvider,
    fallbackProvider: requestedFallback === sourceProvider
      ? (sourceProvider === 'codex' ? 'claude' : 'codex')
      : requestedFallback,
    windowKind,
    thresholdPercent: Number.isFinite(threshold) ? Math.max(50, Math.min(100, Math.round(threshold))) : DEFAULT_USAGE_ROUTING_POLICY.thresholdPercent,
  };
}

export function buildUsageRoutingReport(usages: ProviderUsage[], value?: unknown): UsageRoutingReport {
  const policy = normalizeUsageRoutingPolicy(value);
  const providers = usages.map((usage) => {
    const monitoredUsedPercent = usage.windows.find((window) => window.kind === policy.windowKind)?.usedPercent ?? null;
    const status: ProviderUsageStatus = usage.error || monitoredUsedPercent === null
      ? 'unavailable'
      : monitoredUsedPercent >= 100
        ? 'exhausted'
        : monitoredUsedPercent >= policy.thresholdPercent
          ? 'near_limit'
          : 'available';
    return { ...usage, status, monitoredUsedPercent };
  });
  const source = providers.find((provider) => provider.provider === policy.sourceProvider);
  const fallback = providers.find((provider) => provider.provider === policy.fallbackProvider);
  const shouldFallback = Boolean(
    policy.enabled &&
    source &&
    (source.status === 'near_limit' || source.status === 'exhausted' || source.status === 'unavailable') &&
    fallback?.status === 'available'
  );
  return {
    providers,
    policy,
    shouldFallback,
    recommendedProvider: shouldFallback ? policy.fallbackProvider : null,
  };
}
