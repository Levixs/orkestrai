import { FormRequest } from '@beeblock/svelar/forms';
import { UserRoleDto } from '$lib/modules/admin/application/dto/AdminDtos.js';
import { userRoleSchema } from '$lib/modules/admin/contracts/schemas/schemas.js';

export class UserRoleRequest extends FormRequest {
  rules() {
    return userRoleSchema;
  }

  authorize(event: any): boolean {
    return event.locals.user?.role === 'admin';
  }

  passedValidation(data: any): UserRoleDto {
    return UserRoleDto.from(data);
  }
}
