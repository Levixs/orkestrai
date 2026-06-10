import { Action } from '@beeblock/svelar/actions';
import { AuthService } from '$lib/modules/auth/application/services/AuthService.js';
import type { User } from '$lib/modules/auth/domain/models/User.js';

interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const authService = new AuthService();

export class RegisterUserAction extends Action<RegisterInput, ServiceResult<User>> {
  async execute(input: RegisterInput): Promise<ServiceResult<User>> {
    return authService.register(input);
  }
}
