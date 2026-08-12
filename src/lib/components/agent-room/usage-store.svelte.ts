import type { ProviderUsage } from '$lib/modules/agent-room/application/services/UsageService.js';
import { USAGE_REFRESH_INTERVAL_MS } from '$lib/modules/agent-room/domain/usage.js';

export const usageStore = $state<{
  values: ProviderUsage[];
  loading: boolean;
  lastFetchAt: Date | null;
  error: string | null;
}>({
  values: [],
  loading: true,
  lastFetchAt: null,
  error: null,
});

let inFlight: Promise<ProviderUsage[]> | null = null;
let consumers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export async function refreshUsage(force = false): Promise<ProviderUsage[]> {
  if (inFlight && !force) return inFlight;
  usageStore.loading = usageStore.values.length === 0;
  const request = fetch(force ? '/api/agent-room/usage?refresh=1' : '/api/agent-room/usage')
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
      usageStore.values = payload.data ?? [];
      usageStore.lastFetchAt = new Date();
      usageStore.error = null;
      return usageStore.values;
    })
    .catch((error) => {
      usageStore.error = error instanceof Error ? error.message : 'usage_error';
      return usageStore.values;
    })
    .finally(() => {
      usageStore.loading = false;
      if (inFlight === request) inFlight = null;
    });
  inFlight = request;
  return request;
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') void refreshUsage();
}

export function retainUsageFeed(): () => void {
  consumers += 1;
  if (consumers === 1) {
    void refreshUsage();
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshUsage();
    }, USAGE_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  return () => {
    consumers = Math.max(0, consumers - 1);
    if (consumers > 0) return;
    if (timer) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
