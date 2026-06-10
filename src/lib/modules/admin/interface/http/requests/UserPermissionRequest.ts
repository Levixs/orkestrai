import { FormRequest } from '@beeblock/svelar/forms';
import { UserPermissionDto } from '$lib/modules/admin/application/dto/AdminDtos.js';
import { userPermissionSchema } from '$lib/modules/admin/contracts/schemas/schemas.js';

export class UserPermissionRequest extends FormRequest {
  rules() {
    return userPermissionSchema;
  }

  authorize(event: any): boolean {
    return event.locals.user?.role === 'admin';
  }

  passedValidation(data: any): UserPermissionDto {
    return UserPermissionDto.from(data);
  }
}
