import { Resource } from '@beeblock/svelar/routing';
import type { RoleResponse } from '$lib/modules/admin/contracts/schemas/schemas.js';

export class RoleResource extends Resource {
  toJSON(): RoleResponse {
    return {
      id: this.data.id,
      name: this.data.name,
      guard: this.data.guard ?? 'web',
      description: this.data.description ?? null,
    };
  }
}
