import { Service } from '@beeblock/svelar/services';
import { Permissions } from '@beeblock/svelar/permissions';
import { Queue } from '@beeblock/svelar/queue';
import { UserRepository } from '$lib/modules/auth/infrastructure/repositories/UserRepository.js';
import { Post } from '$lib/modules/posts/domain/models/Post.js';
import { User } from '$lib/modules/auth/domain/models/User.js';
import { ExportDataJob } from '$lib/shared/jobs/ExportDataJob.js';

const userRepo = new UserRepository();

export class AdminService extends Service {
  // ── Users ────────────────────────────────────────

  async listUsers() {
    return User.query().get();
  }

  async updateUserRole(userId: number, role: string) {
    const user = await User.find(userId);
    if (!user) return this.fail('User not found');

    user.role = role;
    await user.save();
    return this.ok(user);
  }

  async deleteUser(userId: number, currentUserId: number) {
    if (userId === currentUserId) {
      return this.fail('Cannot delete your own account');
    }

    const user = await User.find(userId);
    if (!user) return this.fail('User not found');

    if (user.role === 'admin') {
      const adminCount = await User.where('role', '=', 'admin').count();
      if (adminCount <= 1) return this.fail('Cannot delete the last admin user');
    }

    await Post.where('user_id', '=', userId).delete();
    await user.delete();
    return this.ok({ message: 'User deleted successfully' });
  }

  // ── Roles ────────────────────────────────────────

  async createRole(name: string, guard?: string, description?: string) {
    const existing = await Permissions.findRole(name, guard);
    if (existing) return this.fail('Role already exists');

    const role = await Permissions.createRole({ name, guard, description });
    return this.ok(role);
  }

  async deleteRole(name: string, guard?: string) {
    await Permissions.deleteRole(name, guard);
    return this.ok({ message: 'Role deleted' });
  }

  // ── Permissions ──────────────────────────────────

  async createPermission(name: string, guard?: string, description?: string) {
    const existing = await Permissions.findPermission(name, guard);
    if (existing) return this.fail('Permission already exists');

    const perm = await Permissions.createPermission({ name, guard, description });
    return this.ok(perm);
  }

  async deletePermission(name: string, guard?: string) {
    await Permissions.deletePermission(name, guard);
    return this.ok({ message: 'Permission deleted' });
  }

  // ── Role-Permission pivots ───────────────────────

  async attachRolePermission(roleId: number, permissionId: number) {
    await Permissions.giveRolePermission(roleId, permissionId);
    return this.ok({ message: 'Permission attached to role' });
  }

  async detachRolePermission(roleId: number, permissionId: number) {
    await Permissions.revokeRolePermission(roleId, permissionId);
    return this.ok({ message: 'Permission detached from role' });
  }

  // ── User-Role pivots ─────────────────────────────

  async assignUserRole(userId: number, roleId: number) {
    await Permissions.assignRole('User', userId, roleId);
    return this.ok({ message: 'Role assigned to user' });
  }

  async removeUserRole(userId: number, roleId: number) {
    await Permissions.removeRole('User', userId, roleId);
    return this.ok({ message: 'Role removed from user' });
  }

  // ── User-Permission pivots ───────────────────────

  async grantUserPermission(userId: number, permissionId: number) {
    await Permissions.giveModelPermission('User', userId, permissionId);
    return this.ok({ message: 'Permission granted to user' });
  }

  async revokeUserPermission(userId: number, permissionId: number) {
    await Permissions.revokeModelPermission('User', userId, permissionId);
    return this.ok({ message: 'Permission revoked from user' });
  }

  // ── Export ───────────────────────────────────────

  async exportData(userId: number, format: 'csv' | 'json') {
    await Queue.dispatch(new ExportDataJob(userId, format));
    return this.ok({ message: `Export job dispatched (format: ${format})` });
  }
}
