import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { ApiKeys } from '@beeblock/svelar/api-keys';
import { CreateApiKeyAction, RevokeApiKeyAction } from '$lib/modules/api-keys/application/actions/ApiKeyActions.js';
import { CreateApiKeyRequest, RevokeApiKeyRequest } from '$lib/modules/api-keys/interface/http/requests/ApiKeyRequests.js';

const createApiKeyRequest = new CreateApiKeyRequest();
const revokeApiKeyRequest = new RevokeApiKeyRequest();
const createApiKeyAction = new CreateApiKeyAction();
const revokeApiKeyAction = new RevokeApiKeyAction();

async function authorize(dto: { authorize(event: any): boolean | Promise<boolean> }, event: any) {
  if (!await dto.authorize(event)) {
    return fail(403, { message: 'This action is unauthorized.' });
  }
  return null;
}

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user as any;
  let keys: any[] = [];

  try {
    keys = await ApiKeys.listForUser(user.id);
  } catch {}

  return {
    user: { id: user.id, name: user.name, email: user.email },
    createKeyForm: await superValidate({ permissions: 'read' }, zod(createApiKeyRequest.rules()), { id: 'create-api-key' }),
    revokeKeyForm: await superValidate(zod(revokeApiKeyRequest.rules()), { id: 'revoke-api-key' }),
    apiKeys: keys.map((k: any) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      permissions: k.permissions ?? [],
      lastUsedAt: k.lastUsedAt ?? null,
      createdAt: k.createdAt,
    })),
  };
};

export const actions: Actions = {
  create: async (event) => {
    const unauthorized = await authorize(createApiKeyRequest, event);
    if (unauthorized) return unauthorized;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(createApiKeyRequest.rules()), { id: 'create-api-key' });
    if (!validated.valid) return fail(422, { createKeyForm: validated });
    const dto = createApiKeyRequest.passedValidation(validated.data);
    try {
      const { plainTextKey, record } = await createApiKeyAction.run({ userId: (event.locals.user as any).id, dto });
      return { success: true, createKeyForm: validated, plainTextKey, keyId: record.id };
    } catch (err: any) {
      return fail(500, { error: err.message || 'Failed to create key' });
    }
  },

  revoke: async (event) => {
    const unauthorized = await authorize(revokeApiKeyRequest, event);
    if (unauthorized) return unauthorized;
    const form = await event.request.formData();
    const validated = await superValidate(form, zod(revokeApiKeyRequest.rules()), { id: 'revoke-api-key' });
    if (!validated.valid) return fail(422, { revokeKeyForm: validated });
    try {
      await revokeApiKeyAction.run(revokeApiKeyRequest.passedValidation(validated.data));
      return { success: true, revoked: true };
    } catch (err: any) {
      return fail(500, { error: err.message || 'Failed to revoke key' });
    }
  },
};
