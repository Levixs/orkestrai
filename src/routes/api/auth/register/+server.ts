import { ThrottleMiddleware } from '@beeblock/svelar/middleware';
import { AuthController } from '$lib/modules/auth/interface/http/controllers/AuthController.js';

const throttleOptions = {
  store: process.env.RATE_LIMIT_STORE === 'cache' ? 'cache' as const : 'memory' as const,
  cacheStore: process.env.RATE_LIMIT_CACHE_STORE || process.env.CACHE_DRIVER,
};
const throttle = new ThrottleMiddleware({ maxAttempts: 5, decayMinutes: 2, ...throttleOptions });
const ctrl = new AuthController();

export async function POST(event: any) {
  return throttle.handle(
    { event, params: event.params, locals: event.locals },
    () => ctrl.handle('register')(event)
  );
}
