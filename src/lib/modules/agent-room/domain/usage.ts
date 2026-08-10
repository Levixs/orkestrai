export const USAGE_REFRESH_INTERVAL_MS = 5 * 60_000;

export type UsageSeverity = 'normal' | 'warning' | 'danger';

export function usageSeverity(usedPercent: number): UsageSeverity {
  if (usedPercent >= 85) return 'danger';
  if (usedPercent >= 60) return 'warning';
  return 'normal';
}
