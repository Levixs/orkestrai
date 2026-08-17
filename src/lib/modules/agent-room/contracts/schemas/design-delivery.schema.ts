import { z } from '@beeblock/svelar/validation';
import { designCodeArtifactSchema, designElementSchema, designOperationSchema } from './designSchemas.js';

export const designDeliveryFrameworkSchema = z.enum(['svelar', 'svelte', 'react', 'next', 'vue', 'html']);
export const designMarkupFormatSchema = z.enum(['html', 'svelte', 'react', 'vue']);

const generationFields = {
  framework: designDeliveryFrameworkSchema,
  elementIds: z.array(z.string().uuid()).min(1).max(500),
  outputPath: z.string().trim().min(1).max(1_024),
  componentName: z.string().trim().min(1).max(160),
};

export const previewDesignDeliverySchema = z.object(generationFields);

export const applyDesignDeliverySchema = z.object({
  ...generationFields,
  baseRevision: z.number().int().min(0),
  expectedExistingHash: z.string().regex(/^[0-9a-f]{64}$/).nullable().default(null),
});

const bridgeActorFields = {
  summary: z.string().trim().min(1).max(500).optional(),
  taskId: z.string().uuid().nullable().optional(),
  from: z.string().trim().min(1).max(180).nullable().optional(),
};

export const bridgeApplyDesignDeliverySchema = applyDesignDeliverySchema.extend(bridgeActorFields);

export const importDesignMarkupSchema = z.object({
  baseRevision: z.number().int().min(0),
  format: designMarkupFormatSchema,
  name: z.string().trim().min(1).max(160),
  markup: z.string().trim().min(1).max(1_000_000),
  css: z.string().max(500_000).default(''),
  x: z.number().finite().min(-100_000).max(100_000).default(80),
  y: z.number().finite().min(-100_000).max(100_000).default(80),
  parentId: z.string().uuid().nullable().default(null),
});

export const bridgeImportDesignMarkupSchema = importDesignMarkupSchema.extend({
  summary: bridgeActorFields.summary,
  taskId: bridgeActorFields.taskId,
  from: bridgeActorFields.from,
});

export const captureDesignDeliverySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('portal'), nodeId: z.string().uuid() }),
  z.object({ kind: z.literal('device'), nodeId: z.null().default(null) }),
]);

export const designGeneratedFileSchema = z.object({
  sourceRevision: z.number().int().min(0),
  path: z.string().min(1).max(1_024),
  content: z.string().max(2_000_000),
  existingContent: z.string().max(2_000_000).nullable(),
  existingHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  status: z.enum(['create', 'update', 'unchanged']),
  mappingsUsed: designCodeArtifactSchema.shape.componentMappings,
  warnings: z.array(z.string().max(500)).max(200),
});

export const designAppliedFileSchema = designGeneratedFileSchema.extend({
  artifact: designCodeArtifactSchema,
});

export const designImportResultSchema = z.object({
  rootIds: z.array(z.string().uuid()).min(1).max(500),
  elements: z.array(designElementSchema).min(1).max(10_000),
  operations: z.array(designOperationSchema).min(1).max(10_000),
  warnings: z.array(z.string().max(500)).max(200),
});

export const designDeliveryTargetSchema = z.object({
  kind: z.enum(['portal', 'device']),
  nodeId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(180),
  available: z.boolean(),
  detail: z.string().max(500).nullable(),
});

export type DesignDeliveryFramework = z.infer<typeof designDeliveryFrameworkSchema>;
export type DesignMarkupFormat = z.infer<typeof designMarkupFormatSchema>;
export type PreviewDesignDeliveryInput = z.infer<typeof previewDesignDeliverySchema>;
export type ApplyDesignDeliveryInput = z.infer<typeof applyDesignDeliverySchema>;
export type ImportDesignMarkupInput = z.infer<typeof importDesignMarkupSchema>;
export type CaptureDesignDeliveryInput = z.infer<typeof captureDesignDeliverySchema>;
export type DesignGeneratedFile = z.infer<typeof designGeneratedFileSchema>;
export type DesignAppliedFile = z.infer<typeof designAppliedFileSchema>;
export type DesignImportResult = z.infer<typeof designImportResultSchema>;
export type DesignDeliveryTarget = z.infer<typeof designDeliveryTargetSchema>;
