import { Service } from '@beeblock/svelar/services';
import { Hash } from '@beeblock/svelar/hashing';
import { Event } from '@beeblock/svelar/events';
import { UserRepository } from '$lib/modules/auth/infrastructure/repositories/UserRepository.js';
import { UserRegistered } from '$lib/modules/auth/domain/events/UserRegistered.js';

const userRepo = new UserRepository();

export class AuthService extends Service {
  async register(data: { name: string; email: string; password: string }) {
    const existing = await userRepo.findByEmail(data.email);
    if (existing) {
      return this.fail('Email already registered');
    }

    const hashedPassword = await Hash.make(data.password);
    const user = await userRepo.create({
      name: data.name,
      email: data.email,
      password: hashedPassword,
    });

    // Dispatch event — triggers SendWelcomeEmailListener (queues welcome email + notification)
    await Event.dispatch(new UserRegistered(user));
    return this.ok(user);
  }

  async login(email: string, password: string) {
    const user = await userRepo.findByEmail(email);
    if (!user) {
      return this.fail('Invalid credentials');
    }

    const valid = await Hash.verify(password, (user as any).password);
    if (!valid) {
      return this.fail('Invalid credentials');
    }

    return this.ok(user);
  }

  async forgotPassword(email: string, auth: any) {
    // Always return success to avoid leaking whether user exists
    await auth.sendPasswordReset(email);
    return this.ok({ message: 'If that email exists, a reset link has been sent.' });
  }

  async resetPassword(token: string, email: string, password: string, auth: any) {
    const success = await auth.resetPassword(token, email, password);
    if (!success) {
      return this.fail('Invalid or expired reset link');
    }
    return this.ok({ message: 'Password has been reset. You can now log in.' });
  }

  async sendOtp(email: string, auth: any) {
    await auth.sendOtp(email);
    return this.ok({ message: 'If that email exists, a verification code has been sent.' });
  }

  async verifyOtp(email: string, code: string, auth: any, session: any) {
    const user = await auth.attemptOtp(email, code, session);
    if (!user) {
      return this.fail('Invalid or expired code');
    }
    return this.ok(user);
  }
}
