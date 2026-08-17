import { z } from '@beeblock/svelar/validation';

export const designExplorationPlatformSchema = z.enum([
  'responsive-web',
  'desktop',
  'mobile-web',
  'native-mobile',
]);

export const designExplorationCodeTargetSchema = z.enum([
  'svelar',
  'svelte',
  'react',
  'next',
  'vue',
  'html',
]);

export const designExplorationExecutionSchema = z.enum(['manual', 'leader']);
export const designExplorationLocaleSchema = z.enum(['pt-BR', 'en', 'es']);

export const createDesignExplorationSchema = z.object({
  title: z.string().trim().min(3).max(120),
  objective: z.string().trim().min(10).max(4_000),
  audience: z.string().trim().max(1_000).default(''),
  platform: designExplorationPlatformSchema.default('responsive-web'),
  codeTarget: designExplorationCodeTargetSchema.default('svelar'),
  constraints: z.string().trim().max(4_000).default(''),
  references: z.string().trim().max(4_000).default(''),
  includeDarkMode: z.boolean().default(true),
  executionMode: designExplorationExecutionSchema.default('manual'),
  leaderNodeId: z.string().uuid().nullable().optional(),
  locale: designExplorationLocaleSchema.default('en'),
}).superRefine((input, context) => {
  if (input.executionMode === 'leader' && !input.leaderNodeId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['leaderNodeId'],
      message: 'Select the workspace leader before starting the workflow.',
    });
  }
});

export type CreateDesignExplorationInput = z.infer<typeof createDesignExplorationSchema>;
export type DesignExplorationPlatform = z.infer<typeof designExplorationPlatformSchema>;
export type DesignExplorationCodeTarget = z.infer<typeof designExplorationCodeTargetSchema>;
export type DesignExplorationExecution = z.infer<typeof designExplorationExecutionSchema>;
export type DesignExplorationLocale = z.infer<typeof designExplorationLocaleSchema>;
