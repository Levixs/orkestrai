import { z } from 'zod';

export const designElementTypeSchema = z.enum(['frame', 'rectangle', 'ellipse', 'text']);
const designPaintSchema = z.string().trim().regex(/^(transparent|#[0-9a-f]{3,8})$/i).default('transparent');

export const designElementSchema = z.object({
  id: z.string().uuid(),
  pageId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  type: designElementTypeSchema,
  name: z.string().trim().min(1).max(120),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(1).max(100_000),
  height: z.number().finite().min(1).max(100_000),
  rotation: z.number().finite().min(-3600).max(3600).default(0),
  opacity: z.number().finite().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  fill: designPaintSchema.default('#ffffff'),
  stroke: designPaintSchema,
  strokeWidth: z.number().finite().min(0).max(100).default(0),
  cornerRadius: z.number().finite().min(0).max(10_000).default(0),
  text: z.string().max(20_000).default(''),
  fontSize: z.number().finite().min(4).max(1000).default(16),
  fontWeight: z.number().int().min(100).max(900).default(400),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  order: z.number().int().min(0).max(1_000_000),
});

export const designPageSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  width: z.number().finite().min(1).max(100_000),
  height: z.number().finite().min(1).max(100_000),
  background: designPaintSchema.default('#f7f7f5'),
  order: z.number().int().min(0).max(10_000),
});

export const designDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  nodeId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  revision: z.number().int().min(0),
  activePageId: z.string().uuid(),
  pages: z.array(designPageSchema).min(1).max(100),
  elements: z.array(designElementSchema).max(25_000),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const designElementChangesSchema = designElementSchema
  .omit({ id: true, pageId: true, parentId: true, type: true })
  .partial();

export const designOperationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('create'),
    element: designElementSchema.omit({ id: true, order: true }).extend({
      id: z.string().uuid().optional(),
      order: z.number().int().min(0).optional(),
    }),
  }),
  z.object({ kind: z.literal('update'), elementId: z.string().uuid(), changes: designElementChangesSchema }),
  z.object({ kind: z.literal('delete'), elementId: z.string().uuid() }),
  z.object({ kind: z.literal('reorder'), elementId: z.string().uuid(), order: z.number().int().min(0).max(1_000_000) }),
  z.object({ kind: z.literal('set-active-page'), pageId: z.string().uuid() }),
  z.object({ kind: z.literal('rename-document'), name: z.string().trim().min(1).max(180) }),
]);

export const applyDesignOperationsSchema = z.object({
  baseRevision: z.number().int().min(0),
  operations: z.array(designOperationSchema).min(1).max(200),
  actor: z.object({
    kind: z.enum(['user', 'agent', 'system']).default('user'),
    id: z.string().trim().max(120).nullable().default(null),
    name: z.string().trim().max(120).nullable().default(null),
    taskId: z.string().uuid().nullable().default(null),
  }).default({ kind: 'user', id: null, name: null, taskId: null }),
  summary: z.string().trim().min(1).max(500),
});

export type DesignElement = z.infer<typeof designElementSchema>;
export type DesignPage = z.infer<typeof designPageSchema>;
export type DesignDocument = z.infer<typeof designDocumentSchema>;
export type DesignOperation = z.infer<typeof designOperationSchema>;
export type ApplyDesignOperationsInput = z.infer<typeof applyDesignOperationsSchema>;
