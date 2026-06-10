import { Resource } from '@beeblock/svelar/routing';
import type { PermissionResponse } from '$lib/modules/admin/contracts/schemas/schemas.js';

export class PermissionResource extends Resource {
  toJSON(): PermissionResponse {
    return {
      id: this.data.id,
      name: this.data.name,
      guard: this.data.guard ?? 'web',
      description: this.data.description ?? null,
    };
  }
}
