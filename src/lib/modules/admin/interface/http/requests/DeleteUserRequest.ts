import { FormRequest } from '@beeblock/svelar/forms';
import { DeleteUserDto } from '$lib/modules/admin/application/dto/AdminDtos.js';
import { deleteUserSchema } from '$lib/modules/admin/contracts/schemas/schemas.js';

export class DeleteUserRequest extends FormRequest {
  rules() {
    return deleteUserSchema;
  }

  authorize(event: any): boolean {
    return event.locals.user?.role === 'admin';
  }

  passedValidation(data: any): DeleteUserDto {
    return DeleteUserDto.from(data);
  }
}
