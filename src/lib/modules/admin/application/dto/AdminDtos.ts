import type {
  CreatePermissionInput,
  CreateRoleInput,
  DeletePermissionInput,
  DeleteRoleInput,
  DeleteUserInput,
  RolePermissionInput,
  UpdateUserRoleInput,
  UserPermissionInput,
  UserRoleInput,
} from '$lib/modules/admin/contracts/schemas/schemas.js';

export class UpdateUserRoleDto {
  constructor(
    public readonly userId: number,
    public readonly role: 'user' | 'admin'
  ) {}

  static from(input: UpdateUserRoleInput): UpdateUserRoleDto {
    return new UpdateUserRoleDto(input.userId, input.role);
  }
}

export class DeleteUserDto {
  constructor(public readonly userId: number) {}

  static from(input: DeleteUserInput): DeleteUserDto {
    return new DeleteUserDto(input.userId);
  }
}

export class CreateRoleDto {
  constructor(
    public readonly name: string,
    public readonly guard: string | undefined,
    public readonly description: string | undefined
  ) {}

  static from(input: CreateRoleInput): CreateRoleDto {
    return new CreateRoleDto(input.name, input.guard || undefined, input.description || undefined);
  }
}

export class DeleteRoleDto {
  constructor(
    public readonly name: string,
    public readonly guard: string | undefined
  ) {}

  static from(input: DeleteRoleInput): DeleteRoleDto {
    return new DeleteRoleDto(input.name, input.guard || undefined);
  }
}

export class CreatePermissionDto {
  constructor(
    public readonly name: string,
    public readonly guard: string | undefined,
    public readonly description: string | undefined
  ) {}

  static from(input: CreatePermissionInput): CreatePermissionDto {
    return new CreatePermissionDto(input.name, input.guard || undefined, input.description || undefined);
  }
}

export class DeletePermissionDto {
  constructor(
    public readonly name: string,
    public readonly guard: string | undefined
  ) {}

  static from(input: DeletePermissionInput): DeletePermissionDto {
    return new DeletePermissionDto(input.name, input.guard || undefined);
  }
}

export class RolePermissionDto {
  constructor(
    public readonly roleId: number,
    public readonly permissionId: number
  ) {}

  static from(input: RolePermissionInput): RolePermissionDto {
    return new RolePermissionDto(input.roleId, input.permissionId);
  }
}

export class UserRoleDto {
  constructor(
    public readonly userId: number,
    public readonly roleId: number
  ) {}

  static from(input: UserRoleInput): UserRoleDto {
    return new UserRoleDto(input.userId, input.roleId);
  }
}

export class UserPermissionDto {
  constructor(
    public readonly userId: number,
    public readonly permissionId: number
  ) {}

  static from(input: UserPermissionInput): UserPermissionDto {
    return new UserPermissionDto(input.userId, input.permissionId);
  }
}
