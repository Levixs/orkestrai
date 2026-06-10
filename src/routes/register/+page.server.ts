import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message, setError } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { ThrottleMiddleware } from '@beeblock/svelar/middleware';
import { registerSchema } from '$lib/modules/auth/contracts/schemas/schemas';
import { AuthService } from '$lib/modules/auth/application/services/AuthService';
import { auth, authConfig } from '../../app.js';

const authService = new AuthService();
const throttle = new ThrottleMiddleware({
  maxAttempts: 5,
  decayMinutes: 2,
  prefix: 'auth-register',
  store: process.env.RATE_LIMIT_STORE === 'cache' ? 'cache' : 'memory',
  cacheStore: process.env.RATE_LIMIT_CACHE_STORE || process.env.CACHE_DRIVER,
});

function throttleContext(event: any) {
  return { event, params: event.params ?? {}, locals: event.locals ?? {} };
}

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) throw redirect(302, '/dashboard');

  const form = await superValidate(zod(registerSchema));
  return { form };
};

export const actions: Actions = {
  default: async (event) => {
    const { request, locals } = event;
    const form = await superValidate(request, zod(registerSchema));
    const ctx = throttleContext(event);
    const block = await throttle.check(ctx);
    if (block.blocked) {
      return message(form, 'Too many attempts. Please try again later.', { status: 429 });
    }

    if (!form.valid) {
      await throttle.hit(ctx);
      return fail(400, { form });
    }

    const result = await authService.register({
      name: form.data.name,
      email: form.data.email,
      password: form.data.password,
    });

    if (!result.success) {
      await throttle.hit(ctx);
      if (result.error?.includes('Email')) {
        return setError(form, 'email', result.error);
      }
      return message(form, result.error || 'Registration failed', { status: 422 });
    }

    await throttle.clear(ctx);
    const user = result.data!;
    locals.session.set('auth_user_id', (user as any).id);
    locals.session.regenerateId();

    // Send verification email if required
    if (authConfig.emailVerificationRequired) {
      await auth.sendVerificationEmail(user as any);
    }

    throw redirect(302, '/dashboard');
  },
};
