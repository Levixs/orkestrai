import { Model } from '@beeblock/svelar/orm';
import { HasRoles } from '@beeblock/svelar/permissions';
import { auditable } from '@beeblock/svelar/audit';

/**
 * User model with HasRoles mixin and audit logging.
 */
export class User extends HasRoles(Model) {
  static table = 'users';
  static timestamps = true;
  static fillable = ['name', 'email', 'password', 'role'];
  static hidden = ['password'];

  declare id: number;
  declare name: string;
  declare email: string;
  declare password: string;
  declare role: string;
  declare created_at: Date;
  declare updated_at: Date;

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  posts() {
    return this.hasMany(Post, 'user_id');
  }
}

// Enable audit logging for User model (tracks create/update/delete)
auditable(User);

import { Post } from '$lib/modules/posts/domain/models/Post.js';
