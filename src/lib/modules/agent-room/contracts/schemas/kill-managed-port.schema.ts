import { z } from '@beeblock/svelar/validation';

export const killManagedPortSchema = z.object({
  port: z.coerce.number().int().min(1).max(65_535),
  pids: z.array(z.coerce.number().int().min(2)).min(1).max(16),
});

export type KillManagedPortInput = z.infer<typeof killManagedPortSchema>;
