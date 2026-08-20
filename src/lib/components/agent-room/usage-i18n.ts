import type { UsageErrorCode } from '$lib/modules/agent-room/domain/usage.js';
import * as m from '$lib/paraglide/messages.js';

export function usageErrorText(code: UsageErrorCode, provider: string): string {
  if (code === 'unknown_provider') return m['usage.error_unknown_provider']({ provider });
  if (code === 'credentials_missing') return m['usage.error_credentials_missing']({ provider });
  if (code === 'access_token_missing') return m['usage.error_access_token_missing']({ provider });
  if (code === 'refresh_token_missing') return m['usage.error_refresh_token_missing']({ provider });
  if (code === 'credential_expired') return m['usage.error_credential_expired']({ provider });
  if (code === 'refresh_failed') return m['usage.error_refresh_failed']({ provider });
  if (code === 'api_timeout') return m['usage.error_api_timeout']({ provider });
  if (code === 'api_request_failed') return m['usage.error_api_request_failed']({ provider });
  return m['usage.error_unexpected']({ provider });
}
