import { FormRequest } from '@beeblock/svelar/forms';
import { createPostSchema } from '$lib/modules/posts/contracts/schemas/schemas.js';

export class CreatePostRequest extends FormRequest {
  rules() {
    return createPostSchema;
  }

  authorize(event: any): boolean {
    return !!event.locals.user;
  }

  passedValidation(data: any) {
    if (!data.slug) {
      data.slug = data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }
    return data;
  }
}
