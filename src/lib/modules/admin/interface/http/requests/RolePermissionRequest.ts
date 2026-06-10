import { FormRequest } from '@beeblock/svelar/forms';
import { RolePermissionDto } from '$lib/modules/admin/application/dto/AdminDtos.js';
import { rolePermissionSchema } from '$lib/modules/admin/contracts/schemas/schemas.js';

export class RolePermissionRequest extends FormRequest {
  rules() {
    return rolePermissionSchema;
  }

  authorize(event: any): boolean {
    return event.locals.user?.role === 'admin';
  }

  passedValidation(data: any): RolePermissionDto {
    return RolePermissionDto.from(data);
  }
}
