import { Resource } from '@beeblock/svelar/routing';
import type { PostResponse } from '$lib/modules/posts/contracts/schemas/schemas.js';

export class PostResource extends Resource {
  toJSON(): PostResponse {
    return {
      id: this.data.id,
      title: this.data.title,
      slug: this.data.slug,
      body: this.data.body,
      published: !!this.data.published,
      user_id: this.data.user_id,
      created_at: this.data.created_at ?? null,
      updated_at: this.data.updated_at ?? null,
    };
  }
}
