import { Action } from '@beeblock/svelar/actions';
import { AdminService } from '$lib/modules/admin/application/services/AdminService.js';
import type {
  CreatePermissionDto,
  CreateRoleDto,
  DeletePermissionDto,
  DeleteRoleDto,
  DeleteUserDto,
  RolePermissionDto,
  UpdateUserRoleDto,
  UserPermissionDto,
  UserRoleDto,
} from '$lib/modules/admin/application/dto/AdminDtos.js';

const service = new AdminService();

export class UpdateUserRoleAction extends Action<UpdateUserRoleDto, unknown> {
  async execute(dto: UpdateUserRoleDto): Promise<unknown> {
    return service.updateUserRole(dto.userId, dto.role);
  }
}

export class DeleteUserAction extends Action<{ dto: DeleteUserDto; currentUserId: number }, unknown> {
  async execute(input: { dto: DeleteUserDto; currentUserId: number }): Promise<unknown> {
    return service.deleteUser(input.dto.userId, input.currentUserId);
  }
}

export class CreateRoleAction extends Action<CreateRoleDto, unknown> {
  async execute(dto: CreateRoleDto): Promise<unknown> {
    return service.createRole(dto.name, dto.guard, dto.description);
  }
}

export class DeleteRoleAction extends Action<DeleteRoleDto, unknown> {
  async execute(dto: DeleteRoleDto): Promise<unknown> {
    return service.deleteRole(dto.name, dto.guard);
  }
}

export class CreatePermissionAction extends Action<CreatePermissionDto, unknown> {
  async execute(dto: CreatePermissionDto): Promise<unknown> {
    return service.createPermission(dto.name, dto.guard, dto.description);
  }
}

export class DeletePermissionAction extends Action<DeletePermissionDto, unknown> {
  async execute(dto: DeletePermissionDto): Promise<unknown> {
    return service.deletePermission(dto.name, dto.guard);
  }
}

export class AttachRolePermissionAction extends Action<RolePermissionDto, unknown> {
  async execute(dto: RolePermissionDto): Promise<unknown> {
    return service.attachRolePermission(dto.roleId, dto.permissionId);
  }
}

export class DetachRolePermissionAction extends Action<RolePermissionDto, unknown> {
  async execute(dto: RolePermissionDto): Promise<unknown> {
    return service.detachRolePermission(dto.roleId, dto.permissionId);
  }
}

export class AssignUserRoleAction extends Action<UserRoleDto, unknown> {
  async execute(dto: UserRoleDto): Promise<unknown> {
    return service.assignUserRole(dto.userId, dto.roleId);
  }
}

export class RemoveUserRoleAction extends Action<UserRoleDto, unknown> {
  async execute(dto: UserRoleDto): Promise<unknown> {
    return service.removeUserRole(dto.userId, dto.roleId);
  }
}

export class GrantUserPermissionAction extends Action<UserPermissionDto, unknown> {
  async execute(dto: UserPermissionDto): Promise<unknown> {
    return service.grantUserPermission(dto.userId, dto.permissionId);
  }
}

export class RevokeUserPermissionAction extends Action<UserPermissionDto, unknown> {
  async execute(dto: UserPermissionDto): Promise<unknown> {
    return service.revokeUserPermission(dto.userId, dto.permissionId);
  }
}
