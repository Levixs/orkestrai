import { FormRequest } from '@beeblock/svelar/forms';
import { UpdateUserRoleDto } from '$lib/modules/admin/application/dto/AdminDtos.js';
import { updateUserRoleSchema } from '$lib/modules/admin/contracts/schemas/schemas.js';

export class UpdateUserRoleRequest extends FormRequest {
  rules() {
    return updateUserRoleSchema;
  }

  authorize(event: any): boolean {
    return event.locals.user?.role === 'admin';
  }

  passedValidation(data: any): UpdateUserRoleDto {
    return UpdateUserRoleDto.from(data);
  }
}
