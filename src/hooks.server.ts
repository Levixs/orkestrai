/**
 * SvelteKit Server Hooks — Svelar middleware pipeline
 */

import { createSvelarApp } from '@beeblock/svelar/hooks';
import { DatabaseSessionStore } from '@beeblock/svelar/session';
import type { Handle } from '@sveltejs/kit';

// Import app.ts to trigger database + hashing + auth configuration
import { auth } from './app.js';

const svelar = createSvelarApp({
  auth,
  secret: process.env.APP_KEY,
  sessionStore: new DatabaseSessionStore(),
  rateLimitStore: process.env.RATE_LIMIT_STORE === 'cache' ? 'cache' : 'memory',
  rateLimitCacheStore: process.env.RATE_LIMIT_CACHE_STORE || process.env.CACHE_DRIVER,
  authThrottleStore: process.env.RATE_LIMIT_STORE === 'cache' ? 'cache' : 'memory',
  authThrottleCacheStore: process.env.RATE_LIMIT_CACHE_STORE || process.env.CACHE_DRIVER,
  csrfExcludePaths: ['/api/webhooks', '/api/internal/', '/api/agent-room'],
});

export const handle: Handle = async ({ event, resolve }) => {
  return svelar.handle({
    event,
    resolve: async (event, options) => {
      const response = await resolve(event, options);
      response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      return response;
    },
  });
};

export const handleError = svelar.handleError;
