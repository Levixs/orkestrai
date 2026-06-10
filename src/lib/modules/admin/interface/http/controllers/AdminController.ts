import { Controller } from '@beeblock/svelar/routing';
import { Gate } from '@beeblock/svelar/auth';
import { AdminService } from '$lib/modules/admin/application/services/AdminService.js';
import { UserResource } from '$lib/modules/auth/interface/http/resources/UserResource.js';
import { RoleResource } from '$lib/modules/admin/interface/http/resources/RoleResource.js';
import { PermissionResource } from '$lib/modules/admin/interface/http/resources/PermissionResource.js';
import { UpdateUserRoleRequest } from '$lib/modules/admin/interface/http/requests/UpdateUserRoleRequest.js';
import { DeleteUserRequest } from '$lib/modules/admin/interface/http/requests/DeleteUserRequest.js';
import { CreateRoleRequest } from '$lib/modules/admin/interface/http/requests/CreateRoleRequest.js';
import { DeleteRoleRequest } from '$lib/modules/admin/interface/http/requests/DeleteRoleRequest.js';
import { CreatePermissionRequest } from '$lib/modules/admin/interface/http/requests/CreatePermissionRequest.js';
import { DeletePermissionRequest } from '$lib/modules/admin/interface/http/requests/DeletePermissionRequest.js';
import { RolePermissionRequest } from '$lib/modules/admin/interface/http/requests/RolePermissionRequest.js';
import { UserRoleRequest } from '$lib/modules/admin/interface/http/requests/UserRoleRequest.js';
import { UserPermissionRequest } from '$lib/modules/admin/interface/http/requests/UserPermissionRequest.js';
import { ExportDataRequest } from '$lib/modules/admin/interface/http/requests/ExportDataRequest.js';

const adminService = new AdminService();

export class AdminController extends Controller {
  private async authorize(event: any) {
    if (await Gate.denies('admin-access', event.locals.user)) {
      return this.json({ message: 'Unauthorized' }, 403);
    }
    return null;
  }

  // ── Users ────────────────────────────────────────────

  async listUsers(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const users = await adminService.listUsers();
    return UserResource.collection(users).toResponse();
  }

  async updateUserRole(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await UpdateUserRoleRequest.validate(event);
    const result = await adminService.updateUserRole(data.userId, data.role);
    if (!result.success) return this.json({ message: result.error }, 400);

    return UserResource.make(result.data).toResponse();
  }

  async deleteUser(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await DeleteUserRequest.validate(event);
    const result = await adminService.deleteUser(data.userId, event.locals.user.id);
    if (!result.success) return this.json({ message: result.error }, 400);

    return this.json(result.data);
  }

  // ── Roles ────────────────────────────────────────────

  async createRole(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await CreateRoleRequest.validate(event);
    const result = await adminService.createRole(data.name, data.guard, data.description);
    if (!result.success) return this.json({ message: result.error }, 409);

    return RoleResource.make(result.data).status(201).toResponse();
  }

  async deleteRole(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await DeleteRoleRequest.validate(event);
    const result = await adminService.deleteRole(data.name, data.guard);
    return this.json(result.data);
  }

  // ── Permissions ──────────────────────────────────────

  async createPermission(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await CreatePermissionRequest.validate(event);
    const result = await adminService.createPermission(data.name, data.guard, data.description);
    if (!result.success) return this.json({ message: result.error }, 409);

    return PermissionResource.make(result.data).status(201).toResponse();
  }

  async deletePermission(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await DeletePermissionRequest.validate(event);
    const result = await adminService.deletePermission(data.name, data.guard);
    return this.json(result.data);
  }

  // ── Role-Permission pivots ───────────────────────────

  async attachRolePermission(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await RolePermissionRequest.validate(event);
    const result = await adminService.attachRolePermission(data.roleId, data.permissionId);
    return this.json(result.data);
  }

  async detachRolePermission(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await RolePermissionRequest.validate(event);
    const result = await adminService.detachRolePermission(data.roleId, data.permissionId);
    return this.json(result.data);
  }

  // ── User-Role pivots ─────────────────────────────────

  async assignUserRole(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await UserRoleRequest.validate(event);
    const result = await adminService.assignUserRole(data.userId, data.roleId);
    return this.json(result.data);
  }

  async removeUserRole(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await UserRoleRequest.validate(event);
    const result = await adminService.removeUserRole(data.userId, data.roleId);
    return this.json(result.data);
  }

  // ── User-Permission pivots ───────────────────────────

  async grantUserPermission(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await UserPermissionRequest.validate(event);
    const result = await adminService.grantUserPermission(data.userId, data.permissionId);
    return this.json(result.data);
  }

  async revokeUserPermission(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await UserPermissionRequest.validate(event);
    const result = await adminService.revokeUserPermission(data.userId, data.permissionId);
    return this.json(result.data);
  }

  // ── Export ───────────────────────────────────────────

  async exportData(event: any) {
    const denied = await this.authorize(event);
    if (denied) return denied;

    const data = await ExportDataRequest.validate(event);
    const result = await adminService.exportData(event.locals.user.id, data.format);
    return this.json(result.data);
  }
}
