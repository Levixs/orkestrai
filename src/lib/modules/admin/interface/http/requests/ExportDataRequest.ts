import { FormRequest } from '@beeblock/svelar/forms';
import { exportDataSchema } from '$lib/modules/admin/contracts/schemas/schemas.js';

export class ExportDataRequest extends FormRequest {
  rules() {
    return exportDataSchema;
  }

  authorize(event: any): boolean {
    return event.locals.user?.role === 'admin';
  }
}
