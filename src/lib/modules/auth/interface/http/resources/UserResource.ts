import { Resource } from '@beeblock/svelar/routing';
import type { UserResponse } from '$lib/modules/auth/contracts/schemas/schemas.js';

export class UserResource extends Resource {
  toJSON(): UserResponse {
    return {
      id: this.data.id,
      name: this.data.name,
      email: this.data.email,
      role: this.data.role ?? 'user',
      created_at: this.data.created_at ?? null,
    };
  }
}
