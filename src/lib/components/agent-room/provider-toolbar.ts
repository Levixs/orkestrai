export const PINNED_AGENT_PROVIDERS_SETTING = 'pinnedAgentProviders';
export const MAX_PINNED_AGENT_PROVIDERS = 4;

export function parsePinnedAgentProviders(value: unknown): string[] {
  let candidate: unknown = value;

  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(candidate)) return [];

  const normalized = candidate
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean);

  return [...new Set(normalized)]
    .slice(0, MAX_PINNED_AGENT_PROVIDERS);
}

export function setAgentProviderPinned(
  current: string[],
  providerId: string,
  pinned: boolean
): { ids: string[]; limitReached: boolean } {
  const ids = parsePinnedAgentProviders(current);
  const withoutProvider = ids.filter((id) => id !== providerId);

  if (!pinned) return { ids: withoutProvider, limitReached: false };
  if (ids.includes(providerId)) return { ids, limitReached: false };
  if (ids.length >= MAX_PINNED_AGENT_PROVIDERS) return { ids, limitReached: true };

  return { ids: [...ids, providerId], limitReached: false };
}
