import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { ThrottleMiddleware } from '@beeblock/svelar/middleware';
import { forgotPasswordSchema } from '$lib/modules/auth/contracts/schemas/schemas';
import { auth } from '../../app.js';

const throttle = new ThrottleMiddleware({
  maxAttempts: 3,
  decayMinutes: 5,
  prefix: 'auth-forgot-password',
  store: process.env.RATE_LIMIT_STORE === 'cache' ? 'cache' : 'memory',
  cacheStore: process.env.RATE_LIMIT_CACHE_STORE || process.env.CACHE_DRIVER,
});

function throttleContext(event: any) {
  return { event, params: event.params ?? {}, locals: event.locals ?? {} };
}

export const load: PageServerLoad = async () => {
  const form = await superValidate(zod(forgotPasswordSchema));
  return { form };
};

export const actions: Actions = {
  default: async (event) => {
    const { request } = event;
    const form = await superValidate(request, zod(forgotPasswordSchema));
    const ctx = throttleContext(event);
    const block = await throttle.check(ctx);
    if (block.blocked) {
      return message(form, 'Too many attempts. Please try again later.', { status: 429 });
    }

    if (!form.valid) {
      await throttle.hit(ctx);
      return fail(400, { form });
    }

    await auth.sendPasswordReset(form.data.email);
    await throttle.hit(ctx);

    return message(form, 'If that email exists, a reset link has been sent. Check your inbox.');
  },
};
