import { Controller } from '@beeblock/svelar/routing';
import { RegisterRequest } from '$lib/modules/auth/interface/http/requests/RegisterRequest.js';
import { LoginRequest } from '$lib/modules/auth/interface/http/requests/LoginRequest.js';
import { ForgotPasswordRequest } from '$lib/modules/auth/interface/http/requests/ForgotPasswordRequest.js';
import { ResetPasswordRequest } from '$lib/modules/auth/interface/http/requests/ResetPasswordRequest.js';
import { OtpSendRequest } from '$lib/modules/auth/interface/http/requests/OtpSendRequest.js';
import { OtpVerifyRequest } from '$lib/modules/auth/interface/http/requests/OtpVerifyRequest.js';
import { RegisterUserAction } from '$lib/modules/auth/application/actions/RegisterUserAction.js';
import { AuthService } from '$lib/modules/auth/application/services/AuthService.js';
import { UserResource } from '$lib/modules/auth/interface/http/resources/UserResource.js';

const registerAction = new RegisterUserAction();
const authService = new AuthService();

export class AuthController extends Controller {
  /** POST /api/auth/register */
  async register(event: any) {
    const data = await RegisterRequest.validate(event);

    const result = await registerAction.run({
      name: data.name,
      email: data.email,
      password: data.password,
    });

    if (!result.success) {
      return this.json({ message: result.error }, 422);
    }

    const user = result.data!;
    event.locals.session.set('auth_user_id', (user as any).id);
    event.locals.session.regenerateId();

    return UserResource.make(user).status(201).toResponse();
  }

  /** POST /api/auth/login */
  async login(event: any) {
    const data = await LoginRequest.validate(event);

    const result = await authService.login(data.email, data.password);

    if (!result.success) {
      return this.json({ message: result.error }, 401);
    }

    const user = result.data!;
    event.locals.session.set('auth_user_id', (user as any).id);
    event.locals.session.regenerateId();

    return UserResource.make(user).toResponse();
  }

  /** POST /api/auth/logout */
  async logout(event: any) {
    event.locals.session.forget('auth_user_id');
    event.locals.session.regenerateId();

    return this.json({ message: 'Logged out successfully' });
  }

  /** GET /api/auth/me */
  async me(event: any) {
    const user = event.locals.user;
    if (!user) {
      return this.json({ message: 'Unauthenticated' }, 401);
    }

    return UserResource.make(user).toResponse();
  }

  /** POST /api/auth/forgot-password */
  async forgotPassword(event: any) {
    const data = await ForgotPasswordRequest.validate(event);
    const result = await authService.forgotPassword(data.email, event.locals.auth);
    return this.json(result.data);
  }

  /** POST /api/auth/reset-password */
  async resetPassword(event: any) {
    const data = await ResetPasswordRequest.validate(event);
    const result = await authService.resetPassword(data.token, data.email, data.password, event.locals.auth);
    if (!result.success) {
      return this.json({ message: result.error }, 400);
    }
    return this.json(result.data);
  }

  /** POST /api/auth/otp/send */
  async sendOtp(event: any) {
    const data = await OtpSendRequest.validate(event);
    const result = await authService.sendOtp(data.email, event.locals.auth);
    return this.json(result.data);
  }

  /** POST /api/auth/otp/verify */
  async verifyOtp(event: any) {
    const data = await OtpVerifyRequest.validate(event);
    const result = await authService.verifyOtp(data.email, data.code, event.locals.auth, event.locals.session);
    if (!result.success) {
      return this.json({ message: result.error }, 401);
    }

    const user = result.data!;
    return this.json({
      message: 'Login successful',
      user: { id: (user as any).id, name: (user as any).name, email: (user as any).email },
    });
  }

  /** GET /api/auth/verify-email */
  async verifyEmail(event: any) {
    const token = event.url.searchParams.get('token');
    const id = event.url.searchParams.get('id');
    if (!token || !id) return this.json({ message: 'Invalid verification link' }, 400);

    const success = await event.locals.auth.verifyEmail(token, id);
    if (!success) {
      return this.json({ message: 'Invalid or expired verification link' }, 400);
    }
    return this.json({ message: 'Email verified successfully' });
  }
}
