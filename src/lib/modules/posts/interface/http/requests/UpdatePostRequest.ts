import { FormRequest } from '@beeblock/svelar/forms';
import { updatePostSchema } from '$lib/modules/posts/contracts/schemas/schemas.js';

export class UpdatePostRequest extends FormRequest {
  rules() {
    return updatePostSchema;
  }

  authorize(event: any): boolean {
    return !!event.locals.user;
  }
}
