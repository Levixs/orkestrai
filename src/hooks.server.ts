/**
 * SvelteKit Server Hooks — Svelar middleware pipeline
 */

import { createSvelarApp } from '@beeblock/svelar/hooks';
import { DatabaseSessionStore } from '@beeblock/svelar/session';
import type { Handle } from '@sveltejs/kit';

// Import app.ts to trigger database + hashing + auth configuration
import { auth } from './app.js';
import { routineService } from '$lib/modules/agent-room/application/services/RoutineService.js';

// Scheduler de rotinas do Agent Room (tick a cada 15s em processo).
const globalRef = globalThis as unknown as { __orkestraiRoutineScheduler?: boolean };
if (!globalRef.__orkestraiRoutineScheduler) {
  globalRef.__orkestraiRoutineScheduler = true;
  routineService.startScheduler();
}

const svelar = createSvelarApp({
  auth,
  secret: process.env.APP_KEY,
  sessionStore: new DatabaseSessionStore(),
  // App desktop local: o limite padrao (100/min) e estourado pela propria UI
  // (assets, polling, WS-adjacent). A suite e2e inteira (24+ specs, cada uma
  // com dezenas de chamadas de API) passa de 5000/min — 50000 cobre com folga.
  rateLimit: Number(process.env.ORKESTRAI_RATE_LIMIT ?? 50_000),
  rateLimitStore: process.env.RATE_LIMIT_STORE === 'cache' ? 'cache' : 'memory',
  rateLimitCacheStore: process.env.RATE_LIMIT_CACHE_STORE || process.env.CACHE_DRIVER,
  authThrottleStore: process.env.RATE_LIMIT_STORE === 'cache' ? 'cache' : 'memory',
  authThrottleCacheStore: process.env.RATE_LIMIT_CACHE_STORE || process.env.CACHE_DRIVER,
  csrfExcludePaths: ['/api/webhooks', '/api/internal/', '/api/agent-room'],
});

/**
 * App local: localhost/127.0.0.1/[::1] apontando para o MESMO host e porta da
 * requisicao e same-origin na pratica. Normaliza o Origin antes do middleware
 * de origem do Svelar (que exige igualdade exata com event.url.origin).
 */
const normalizeLoopbackOrigin: Handle = async ({ event, resolve }) => {
  const origin = event.request.headers.get('origin');
  if (origin && !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) {
    try {
      const originUrl = new URL(origin);
      const requestHost = event.request.headers.get('host');
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(originUrl.hostname);
      if (loopback && originUrl.host === requestHost && originUrl.origin !== event.url.origin) {
        const headers = new Headers(event.request.headers);
        headers.set('origin', event.url.origin);
        const request = new Request(event.request, { headers });
        Object.defineProperty(event, 'request', { value: request, writable: true });
      }
    } catch {
      // origin invalido segue o fluxo normal (sera bloqueado se for cross-site)
    }
  }
  return svelar.handle({
    event,
    resolve: async (event, options) => {
      const response = await resolve(event, options);
      response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
      response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      response.headers.set('Origin-Agent-Cluster', '?1');
      return response;
    },
  });
};

export const handle: Handle = normalizeLoopbackOrigin;

export const handleError = svelar.handleError;
