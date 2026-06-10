import { FormRequest } from '@beeblock/svelar/forms';
import { DeletePermissionDto } from '$lib/modules/admin/application/dto/AdminDtos.js';
import { deletePermissionSchema } from '$lib/modules/admin/contracts/schemas/schemas.js';

export class DeletePermissionRequest extends FormRequest {
  rules() {
    return deletePermissionSchema;
  }

  authorize(event: any): boolean {
    return event.locals.user?.role === 'admin';
  }

  passedValidation(data: any): DeletePermissionDto {
    return DeletePermissionDto.from(data);
  }
}
