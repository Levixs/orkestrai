import { FormRequest } from '@beeblock/svelar/forms';
import { CreateRoleDto } from '$lib/modules/admin/application/dto/AdminDtos.js';
import { createRoleSchema } from '$lib/modules/admin/contracts/schemas/schemas.js';

export class CreateRoleRequest extends FormRequest {
  rules() {
    return createRoleSchema;
  }

  authorize(event: any): boolean {
    return event.locals.user?.role === 'admin';
  }

  passedValidation(data: any): CreateRoleDto {
    return CreateRoleDto.from(data);
  }
}
