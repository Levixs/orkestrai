import { Factory } from '@beeblock/svelar/testing';
import { User } from '$lib/modules/auth/domain/models/User';

export class UserFactory extends Factory<User> {
  model() {
    return User;
  }

  definition() {
    return {
      name: `User ${this.sequence}`,
      email: `user${this.sequence}@test.com`,
      password_hash: 'hashed',
      role: 'user',
    };
  }
}

// Singleton instance for convenience
export default new UserFactory();
