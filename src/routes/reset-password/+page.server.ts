import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { ThrottleMiddleware } from '@beeblock/svelar/middleware';
import { resetPasswordSchema } from '$lib/modules/auth/contracts/schemas/schemas';
import { auth } from '../../app.js';

const throttle = new ThrottleMiddleware({
  maxAttempts: 5,
  decayMinutes: 5,
  prefix: 'auth-reset-password',
  store: process.env.RATE_LIMIT_STORE === 'cache' ? 'cache' : 'memory',
  cacheStore: process.env.RATE_LIMIT_CACHE_STORE || process.env.CACHE_DRIVER,
});

function throttleContext(event: any) {
  return { event, params: event.params ?? {}, locals: event.locals ?? {} };
}

export const load: PageServerLoad = async ({ url }) => {
  const token = url.searchParams.get('token') ?? '';
  const email = url.searchParams.get('email') ?? '';

  if (!token || !email) {
    throw redirect(302, '/forgot-password');
  }

  const form = await superValidate({ token, email, password: '', password_confirmation: '' }, zod(resetPasswordSchema));
  return { form };
};

export const actions: Actions = {
  default: async (event) => {
    const { request } = event;
    const form = await superValidate(request, zod(resetPasswordSchema));
    const ctx = throttleContext(event);
    const block = await throttle.check(ctx);
    if (block.blocked) {
      return message(form, 'Too many attempts. Please try again later.', { status: 429 });
    }

    if (!form.valid) {
      await throttle.hit(ctx);
      return fail(400, { form });
    }

    const success = await auth.resetPassword(form.data.token, form.data.email, form.data.password);

    if (!success) {
      await throttle.hit(ctx);
      return message(form, 'Invalid or expired reset link. Please request a new one.', { status: 400 });
    }

    await throttle.clear(ctx);
    throw redirect(302, '/login?reset=success');
  },
};
