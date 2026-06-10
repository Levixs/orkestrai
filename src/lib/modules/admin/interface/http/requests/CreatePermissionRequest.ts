import { FormRequest } from '@beeblock/svelar/forms';
import { CreatePermissionDto } from '$lib/modules/admin/application/dto/AdminDtos.js';
import { createPermissionSchema } from '$lib/modules/admin/contracts/schemas/schemas.js';

export class CreatePermissionRequest extends FormRequest {
  rules() {
    return createPermissionSchema;
  }

  authorize(event: any): boolean {
    return event.locals.user?.role === 'admin';
  }

  passedValidation(data: any): CreatePermissionDto {
    return CreatePermissionDto.from(data);
  }
}
