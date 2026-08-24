/**
 * Store reativa do status publico dos providers (status.claude.com,
 * status.openai.com etc.), com o mesmo padrao de cache/TTL de
 * app-settings.svelte.ts. Status muda pouco — TTL bem maior que o de
 * settings pra nao bater a cada navegacao. Cache por provider, ja que a
 * pagina de Providers mostra varios de uma vez.
 */
import { PROVIDER_STATUS_SOURCES, type ProviderStatus } from '$lib/modules/agent-room/application/services/ProviderStatusService.js';

const TTL_MS = 180_000;

const empty: ProviderStatus = { indicator: 'none', description: '', incidents: [], checked: false, checkedAt: '' };

let cache = $state<Record<string, ProviderStatus>>({});
const loadedAt = new Map<string, number>();
const pending = new Map<string, Promise<ProviderStatus>>();

export const providerStatusStore = {
  value(providerId: string): ProviderStatus {
    return cache[providerId] ?? empty;
  },
};

export async function getProviderStatus(providerId: string, force = false): Promise<ProviderStatus> {
  if (!(providerId in PROVIDER_STATUS_SOURCES)) return empty;
  const loaded = loadedAt.get(providerId);
  if (!force && loaded && Date.now() - loaded < TTL_MS) return cache[providerId] ?? empty;
  const inFlight = pending.get(providerId);
  if (inFlight) return inFlight;
  const request = (async () => {
    try {
      const response = await fetch(`/api/agent-room/provider-status/${providerId}`);
      const payload = await response.json();
      cache = { ...cache, [providerId]: payload.data ?? cache[providerId] ?? empty };
      loadedAt.set(providerId, Date.now());
    } catch {
      // mantem o cache anterior
    } finally {
      pending.delete(providerId);
    }
    return cache[providerId] ?? empty;
  })();
  pending.set(providerId, request);
  return request;
}
