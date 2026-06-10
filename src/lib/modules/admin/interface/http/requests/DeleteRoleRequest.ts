import { FormRequest } from '@beeblock/svelar/forms';
import { DeleteRoleDto } from '$lib/modules/admin/application/dto/AdminDtos.js';
import { deleteRoleSchema } from '$lib/modules/admin/contracts/schemas/schemas.js';

export class DeleteRoleRequest extends FormRequest {
  rules() {
    return deleteRoleSchema;
  }

  authorize(event: any): boolean {
    return event.locals.user?.role === 'admin';
  }

  passedValidation(data: any): DeleteRoleDto {
    return DeleteRoleDto.from(data);
  }
}
