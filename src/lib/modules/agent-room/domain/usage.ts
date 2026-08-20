export const USAGE_REFRESH_INTERVAL_MS = 5 * 60_000;

export type UsageSeverity = 'normal' | 'warning' | 'danger';

/** Stable API contract. Renderers translate these codes for the active locale. */
export type UsageErrorCode =
  | 'unknown_provider'
  | 'credentials_missing'
  | 'access_token_missing'
  | 'refresh_token_missing'
  | 'credential_expired'
  | 'refresh_failed'
  | 'api_timeout'
  | 'api_request_failed'
  | 'unexpected';

export function usageSeverity(usedPercent: number): UsageSeverity {
  if (usedPercent >= 85) return 'danger';
  if (usedPercent >= 60) return 'warning';
  return 'normal';
}
