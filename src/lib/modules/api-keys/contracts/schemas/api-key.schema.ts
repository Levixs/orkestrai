import { z } from '@beeblock/svelar/validation';

export const createApiKeySchema = z.object({
  name: z.string().trim().min(2, 'Key name must be at least 2 characters').max(120),
  permissions: z.string().trim().min(1, 'At least one permission is required'),
});

export const revokeApiKeySchema = z.object({
  keyId: z.string().trim().min(1, 'Key is required'),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type RevokeApiKeyInput = z.infer<typeof revokeApiKeySchema>;
