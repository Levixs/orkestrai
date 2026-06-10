import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { ThrottleMiddleware } from '@beeblock/svelar/middleware';
import { otpRequestSchema, otpVerifySchema } from '$lib/modules/auth/contracts/schemas/schemas';
import { auth, authConfig } from '../../app.js';

const sendThrottle = new ThrottleMiddleware({
  maxAttempts: 3,
  decayMinutes: 2,
  prefix: 'auth-otp-send',
  store: process.env.RATE_LIMIT_STORE === 'cache' ? 'cache' : 'memory',
  cacheStore: process.env.RATE_LIMIT_CACHE_STORE || process.env.CACHE_DRIVER,
});
const verifyThrottle = new ThrottleMiddleware({
  maxAttempts: 5,
  decayMinutes: 5,
  prefix: 'auth-otp-verify',
  store: process.env.RATE_LIMIT_STORE === 'cache' ? 'cache' : 'memory',
  cacheStore: process.env.RATE_LIMIT_CACHE_STORE || process.env.CACHE_DRIVER,
});

function throttleContext(event: any) {
  return { event, params: event.params ?? {}, locals: event.locals ?? {} };
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!authConfig.otpEnabled) throw redirect(302, '/login');
  if (locals.user) throw redirect(302, '/dashboard');

  const requestForm = await superValidate(zod(otpRequestSchema), { id: 'otp-request' });
  const verifyForm = await superValidate(zod(otpVerifySchema), { id: 'otp-verify' });
  return { requestForm, verifyForm };
};

export const actions: Actions = {
  send: async (event) => {
    const { request } = event;
    const form = await superValidate(request, zod(otpRequestSchema), { id: 'otp-request' });
    const ctx = throttleContext(event);
    const block = await sendThrottle.check(ctx);
    if (block.blocked) {
      return message(form, 'Too many attempts. Please try again later.', { status: 429 });
    }

    if (!form.valid) {
      await sendThrottle.hit(ctx);
      return fail(400, { requestForm: form });
    }

    await auth.sendOtp(form.data.email);
    await sendThrottle.hit(ctx);

    return { requestForm: form, codeSent: true, email: form.data.email };
  },

  verify: async (event) => {
    const { request, locals } = event;
    const form = await superValidate(request, zod(otpVerifySchema), { id: 'otp-verify' });
    const ctx = throttleContext(event);
    const block = await verifyThrottle.check(ctx);
    if (block.blocked) {
      return message(form, 'Too many attempts. Please try again later.', { status: 429 });
    }

    if (!form.valid) {
      await verifyThrottle.hit(ctx);
      return fail(400, { verifyForm: form });
    }

    const user = await auth.attemptOtp(form.data.email, form.data.code, locals.session);

    if (!user) {
      await verifyThrottle.hit(ctx);
      return message(form, 'Invalid or expired code. Please try again.', { status: 401 });
    }

    await verifyThrottle.clear(ctx);
    throw redirect(302, '/dashboard');
  },
};
