import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { User } from '$lib/modules/auth/domain/models/User.js';
import { Post } from '$lib/modules/posts/domain/models/Post.js';
import { JobMonitor } from '@beeblock/svelar/queue/JobMonitor';
import { ScheduleMonitor } from '@beeblock/svelar/scheduler/ScheduleMonitor';
import { LogViewer } from '@beeblock/svelar/logging/LogViewer';
import { Permissions } from '@beeblock/svelar/permissions';
import {
  AssignUserRoleAction,
  AttachRolePermissionAction,
  CreatePermissionAction,
  CreateRoleAction,
  DeletePermissionAction,
  DeleteRoleAction,
  DeleteUserAction,
  DetachRolePermissionAction,
  GrantUserPermissionAction,
  RemoveUserRoleAction,
  RevokeUserPermissionAction,
  UpdateUserRoleAction,
} from '$lib/modules/admin/application/actions/AdminActions.js';
import { CreatePermissionRequest } from '$lib/modules/admin/interface/http/requests/CreatePermissionRequest.js';
import { CreateRoleRequest } from '$lib/modules/admin/interface/http/requests/CreateRoleRequest.js';
import { DeletePermissionRequest } from '$lib/modules/admin/interface/http/requests/DeletePermissionRequest.js';
import { DeleteRoleRequest } from '$lib/modules/admin/interface/http/requests/DeleteRoleRequest.js';
import { DeleteUserRequest } from '$lib/modules/admin/interface/http/requests/DeleteUserRequest.js';
import { RolePermissionRequest } from '$lib/modules/admin/interface/http/requests/RolePermissionRequest.js';
import { UpdateUserRoleRequest } from '$lib/modules/admin/interface/http/requests/UpdateUserRoleRequest.js';
import { UserPermissionRequest } from '$lib/modules/admin/interface/http/requests/UserPermissionRequest.js';
import { UserRoleRequest } from '$lib/modules/admin/interface/http/requests/UserRoleRequest.js';

const createRoleRequest = new CreateRoleRequest();
const deleteRoleRequest = new DeleteRoleRequest();
const createPermissionRequest = new CreatePermissionRequest();
const deletePermissionRequest = new DeletePermissionRequest();
const rolePermissionRequest = new RolePermissionRequest();
const userRoleRequest = new UserRoleRequest();
const userPermissionRequest = new UserPermissionRequest();
const updateUserRoleRequest = new UpdateUserRoleRequest();
const deleteUserRequest = new DeleteUserRequest();

const createRoleAction = new CreateRoleAction();
const deleteRoleAction = new DeleteRoleAction();
const createPermissionAction = new CreatePermissionAction();
const deletePermissionAction = new DeletePermissionAction();
const attachRolePermissionAction = new AttachRolePermissionAction();
const detachRolePermissionAction = new DetachRolePermissionAction();
const assignUserRoleAction = new AssignUserRoleAction();
const removeUserRoleAction = new RemoveUserRoleAction();
const grantUserPermissionAction = new GrantUserPermissionAction();
const revokeUserPermissionAction = new RevokeUserPermissionAction();
const updateUserRoleAction = new UpdateUserRoleAction();
const deleteUserAction = new DeleteUserAction();

async function authorize(request: { authorize(event: any): boolean | Promise<boolean> }, event: any) {
  if (!await request.authorize(event)) return fail(403, { error: 'This action is unauthorized.' });
  return null;
}

function failure(result: any, status = 400) {
  return fail(status, { error: result?.error ?? result?.message ?? 'Admin action failed' });
}

export const load: PageServerLoad = async (event) => {
  const user = event.locals.user;

  // Fetch all users
  const users = await User.query().get();

  // Fetch stats
  const userCount = users.length;
  const postCount = await Post.count();

  const roleDistribution = {
    admin: users.filter((u: any) => u.role === 'admin').length,
    user: users.filter((u: any) => u.role === 'user').length,
  };

  // Queue stats from JobMonitor
  let queueCounts = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, total: 0 };
  try {
    queueCounts = await JobMonitor.getCounts('default');
  } catch { /* sync/memory driver — no counts available */ }

  // Scheduler tasks from ScheduleMonitor
  let scheduledTasks: any[] = [];
  try {
    scheduledTasks = await ScheduleMonitor.listTasks();
  } catch { /* scheduler not configured */ }

  // Recent logs from LogViewer
  let recentLogs: any[] = [];
  let logStats = { totalEntries: 0, byLevel: {} as Record<string, number>, byChannel: {} };
  try {
    recentLogs = LogViewer.query({ limit: 50 });
    logStats = LogViewer.getStats();
  } catch { /* no logs yet */ }

  // System health
  const memUsage = process.memoryUsage();
  const health = {
    status: 'ok',
    uptime: process.uptime(),
    memoryUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
    memoryTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
    memoryPercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
  };

  // Roles & Permissions
  let roles: any[] = [];
  let permissions: any[] = [];
  let rolePermissionsMap: Record<number, number[]> = {};
  let userRolesMap: Record<number, any[]> = {};
  let userDirectPermsMap: Record<number, any[]> = {};
  try {
    roles = await Permissions.allRoles();
    permissions = await Permissions.allPermissions();

    // Load permissions for each role
    for (const role of roles) {
      const rolePerms = await Permissions.getRolePermissions(role.id);
      rolePermissionsMap[role.id] = rolePerms.map((p: any) => p.id);
    }

    // Load roles and direct permissions for each user
    for (const u of users) {
      userRolesMap[u.id] = await Permissions.getModelRoles('User', u.id);
      userDirectPermsMap[u.id] = await Permissions.getModelDirectPermissions('User', u.id);
    }
  } catch { /* permissions tables may not exist yet */ }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    users: users.map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      created_at: u.created_at,
    })),
    stats: {
      userCount,
      postCount,
      roleDistribution,
    },
    queueCounts,
    scheduledTasks: scheduledTasks.map((t: any) => ({
      name: t.name,
      expression: t.expression,
      humanReadable: t.humanReadable,
      enabled: t.enabled,
      isRunning: t.isRunning,
      lastRun: t.lastRun?.toISOString() ?? null,
      lastStatus: t.lastStatus ?? null,
      nextRun: t.nextRun?.toISOString() ?? null,
    })),
    recentLogs: recentLogs.map((l: any) => ({
      timestamp: l.timestamp,
      level: l.level,
      channel: l.channel,
      message: l.message,
    })),
    logStats,
    health,
    roles: roles.map((r: any) => ({
      id: r.id,
      name: r.name,
      guard: r.guard,
      description: r.description,
      created_at: r.created_at,
    })),
    permissions: permissions.map((p: any) => ({
      id: p.id,
      name: p.name,
      guard: p.guard,
      description: p.description,
      created_at: p.created_at,
    })),
    rolePermissionsMap,
    userRolesMap: Object.fromEntries(
      Object.entries(userRolesMap).map(([uid, roles]) => [
        uid,
        roles.map((r: any) => ({ id: r.id, name: r.name })),
      ]),
    ),
    userDirectPermsMap: Object.fromEntries(
      Object.entries(userDirectPermsMap).map(([uid, perms]) => [
        uid,
        perms.map((p: any) => ({ id: p.id, name: p.name })),
      ]),
    ),
    createRoleForm: await superValidate({ guard: 'web' }, zod(createRoleRequest.rules()), { id: 'admin-create-role' }),
    createPermissionForm: await superValidate({ guard: 'web' }, zod(createPermissionRequest.rules()), { id: 'admin-create-permission' }),
  };
};

export const actions: Actions = {
  createRole: async (event) => {
    const denied = await authorize(createRoleRequest, event);
    if (denied) return denied;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(createRoleRequest.rules()), { id: 'admin-create-role' });
    if (!validated.valid) return fail(422, { createRoleForm: validated });
    const result = await createRoleAction.run(createRoleRequest.passedValidation(validated.data)) as any;
    if (!result.success) return failure(result, 409);
    return { message: 'Role created', createRoleForm: validated };
  },

  deleteRole: async (event) => {
    const denied = await authorize(deleteRoleRequest, event);
    if (denied) return denied;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(deleteRoleRequest.rules()), { id: 'admin-delete-role' });
    if (!validated.valid) return fail(422, { error: 'Role name is required' });
    const result = await deleteRoleAction.run(deleteRoleRequest.passedValidation(validated.data)) as any;
    if (!result.success) return failure(result);
    return { message: 'Role deleted' };
  },

  createPermission: async (event) => {
    const denied = await authorize(createPermissionRequest, event);
    if (denied) return denied;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(createPermissionRequest.rules()), { id: 'admin-create-permission' });
    if (!validated.valid) return fail(422, { createPermissionForm: validated });
    const result = await createPermissionAction.run(createPermissionRequest.passedValidation(validated.data)) as any;
    if (!result.success) return failure(result, 409);
    return { message: 'Permission created', createPermissionForm: validated };
  },

  deletePermission: async (event) => {
    const denied = await authorize(deletePermissionRequest, event);
    if (denied) return denied;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(deletePermissionRequest.rules()), { id: 'admin-delete-permission' });
    if (!validated.valid) return fail(422, { error: 'Permission name is required' });
    const result = await deletePermissionAction.run(deletePermissionRequest.passedValidation(validated.data)) as any;
    if (!result.success) return failure(result);
    return { message: 'Permission deleted' };
  },

  attachRolePermission: async (event) => {
    const denied = await authorize(rolePermissionRequest, event);
    if (denied) return denied;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(rolePermissionRequest.rules()), { id: 'admin-role-permission' });
    if (!validated.valid) return fail(422, { error: 'Role and permission are required' });
    const result = await attachRolePermissionAction.run(rolePermissionRequest.passedValidation(validated.data)) as any;
    if (!result.success) return failure(result);
    return { message: 'Permission attached to role' };
  },

  detachRolePermission: async (event) => {
    const denied = await authorize(rolePermissionRequest, event);
    if (denied) return denied;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(rolePermissionRequest.rules()), { id: 'admin-role-permission' });
    if (!validated.valid) return fail(422, { error: 'Role and permission are required' });
    const result = await detachRolePermissionAction.run(rolePermissionRequest.passedValidation(validated.data)) as any;
    if (!result.success) return failure(result);
    return { message: 'Permission detached from role' };
  },

  assignUserRole: async (event) => {
    const denied = await authorize(userRoleRequest, event);
    if (denied) return denied;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(userRoleRequest.rules()), { id: 'admin-user-role' });
    if (!validated.valid) return fail(422, { error: 'User and role are required' });
    const result = await assignUserRoleAction.run(userRoleRequest.passedValidation(validated.data)) as any;
    if (!result.success) return failure(result);
    return { message: 'Role assigned' };
  },

  removeUserRole: async (event) => {
    const denied = await authorize(userRoleRequest, event);
    if (denied) return denied;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(userRoleRequest.rules()), { id: 'admin-user-role' });
    if (!validated.valid) return fail(422, { error: 'User and role are required' });
    const result = await removeUserRoleAction.run(userRoleRequest.passedValidation(validated.data)) as any;
    if (!result.success) return failure(result);
    return { message: 'Role removed' };
  },

  grantUserPermission: async (event) => {
    const denied = await authorize(userPermissionRequest, event);
    if (denied) return denied;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(userPermissionRequest.rules()), { id: 'admin-user-permission' });
    if (!validated.valid) return fail(422, { error: 'User and permission are required' });
    const result = await grantUserPermissionAction.run(userPermissionRequest.passedValidation(validated.data)) as any;
    if (!result.success) return failure(result);
    return { message: 'Permission granted' };
  },

  revokeUserPermission: async (event) => {
    const denied = await authorize(userPermissionRequest, event);
    if (denied) return denied;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(userPermissionRequest.rules()), { id: 'admin-user-permission' });
    if (!validated.valid) return fail(422, { error: 'User and permission are required' });
    const result = await revokeUserPermissionAction.run(userPermissionRequest.passedValidation(validated.data)) as any;
    if (!result.success) return failure(result);
    return { message: 'Permission revoked' };
  },

  updateUserRole: async (event) => {
    const denied = await authorize(updateUserRoleRequest, event);
    if (denied) return denied;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(updateUserRoleRequest.rules()), { id: 'admin-update-user-role' });
    if (!validated.valid) return fail(422, { error: 'User and role are required' });
    const result = await updateUserRoleAction.run(updateUserRoleRequest.passedValidation(validated.data)) as any;
    if (!result.success) return failure(result);
    return { message: 'User role updated' };
  },

  deleteUser: async (event) => {
    const denied = await authorize(deleteUserRequest, event);
    if (denied) return denied;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(deleteUserRequest.rules()), { id: 'admin-delete-user' });
    if (!validated.valid) return fail(422, { error: 'User is required' });
    const result = await deleteUserAction.run({ dto: deleteUserRequest.passedValidation(validated.data), currentUserId: event.locals.user.id }) as any;
    if (!result.success) return failure(result);
    return { message: 'User deleted' };
  },
};
