import type { ProviderUsage } from '../application/services/UsageService.js';

export type UsageRoutingPolicy = {
  enabled: boolean;
  sourceProvider: string;
  fallbackProvider: string;
  thresholdPercent: number;
};

export type ProviderUsageStatus = 'available' | 'near_limit' | 'exhausted' | 'unavailable';

export type UsageRoutingReport = {
  providers: Array<ProviderUsage & { status: ProviderUsageStatus; peakUsedPercent: number | null }>;
  policy: UsageRoutingPolicy;
  shouldFallback: boolean;
  recommendedProvider: string | null;
};

export const DEFAULT_USAGE_ROUTING_POLICY: UsageRoutingPolicy = {
  enabled: true,
  sourceProvider: 'claude',
  fallbackProvider: 'codex',
  thresholdPercent: 90,
};

export function normalizeUsageRoutingPolicy(value: unknown): UsageRoutingPolicy {
  const input = value && typeof value === 'object' ? value as Partial<UsageRoutingPolicy> : {};
  const threshold = Number(input.thresholdPercent);
  const sourceProvider = String(input.sourceProvider || DEFAULT_USAGE_ROUTING_POLICY.sourceProvider).trim().slice(0, 40);
  const requestedFallback = String(input.fallbackProvider || DEFAULT_USAGE_ROUTING_POLICY.fallbackProvider).trim().slice(0, 40);
  return {
    enabled: input.enabled !== false,
    sourceProvider,
    fallbackProvider: requestedFallback === sourceProvider
      ? (sourceProvider === 'codex' ? 'claude' : 'codex')
      : requestedFallback,
    thresholdPercent: Number.isFinite(threshold) ? Math.max(50, Math.min(100, Math.round(threshold))) : DEFAULT_USAGE_ROUTING_POLICY.thresholdPercent,
  };
}

export function buildUsageRoutingReport(usages: ProviderUsage[], value?: unknown): UsageRoutingReport {
  const policy = normalizeUsageRoutingPolicy(value);
  const providers = usages.map((usage) => {
    const peakUsedPercent = usage.windows.length ? Math.max(...usage.windows.map((window) => window.usedPercent)) : null;
    const status: ProviderUsageStatus = usage.error || peakUsedPercent === null
      ? 'unavailable'
      : peakUsedPercent >= 100
        ? 'exhausted'
        : peakUsedPercent >= policy.thresholdPercent
          ? 'near_limit'
          : 'available';
    return { ...usage, status, peakUsedPercent };
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
