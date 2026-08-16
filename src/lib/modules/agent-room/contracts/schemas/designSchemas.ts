import { z } from 'zod';

export const designElementTypeSchema = z.enum(['frame', 'rectangle', 'ellipse', 'text', 'path', 'image']);
const legacyDesignPaintSchema = z.string().trim().regex(/^(transparent|#[0-9a-f]{3,8})$/i).default('transparent');
const designColorSchema = z.string().trim().regex(/^#[0-9a-f]{3,8}$/i);

export const designGradientStopSchema = z.object({
  offset: z.number().finite().min(0).max(1),
  color: designColorSchema,
  opacity: z.number().finite().min(0).max(1).default(1),
});

export const designPaintSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('solid'),
    color: designColorSchema,
    opacity: z.number().finite().min(0).max(1).default(1),
    visible: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('linear-gradient'),
    angle: z.number().finite().min(-3600).max(3600).default(0),
    stops: z.array(designGradientStopSchema).min(2).max(32),
    opacity: z.number().finite().min(0).max(1).default(1),
    visible: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('radial-gradient'),
    centerX: z.number().finite().min(0).max(1).default(0.5),
    centerY: z.number().finite().min(0).max(1).default(0.5),
    radius: z.number().finite().min(0.01).max(4).default(0.5),
    stops: z.array(designGradientStopSchema).min(2).max(32),
    opacity: z.number().finite().min(0).max(1).default(1),
    visible: z.boolean().default(true),
  }),
]);

export const designEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['drop-shadow', 'inner-shadow']),
    color: designColorSchema.default('#00000040'),
    x: z.number().finite().min(-10_000).max(10_000).default(0),
    y: z.number().finite().min(-10_000).max(10_000).default(4),
    blur: z.number().finite().min(0).max(1000).default(12),
    spread: z.number().finite().min(-1000).max(1000).default(0),
    visible: z.boolean().default(true),
  }),
  z.object({
    type: z.enum(['layer-blur', 'background-blur']),
    blur: z.number().finite().min(0).max(1000).default(8),
    visible: z.boolean().default(true),
  }),
]);

export const designPathPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  inX: z.number().finite().nullable().default(null),
  inY: z.number().finite().nullable().default(null),
  outX: z.number().finite().nullable().default(null),
  outY: z.number().finite().nullable().default(null),
  mode: z.enum(['corner', 'mirrored', 'asymmetric', 'disconnected']).default('corner'),
});

export const designAssetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  path: z.string().trim().regex(/^\.orkestrai\/designs\/assets\/[A-Za-z0-9._/-]+$/).max(512),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']),
  size: z.number().int().min(1).max(20 * 1024 * 1024),
  width: z.number().int().min(1).max(100_000).nullable().default(null),
  height: z.number().int().min(1).max(100_000).nullable().default(null),
  createdAt: z.string().datetime(),
});

export const designGuideSchema = z.object({
  id: z.string().uuid(),
  axis: z.enum(['x', 'y']),
  position: z.number().finite().min(-100_000).max(100_000),
});

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
  fill: legacyDesignPaintSchema.default('#ffffff'),
  stroke: legacyDesignPaintSchema,
  strokeWidth: z.number().finite().min(0).max(100).default(0),
  fills: z.array(designPaintSchema).max(16).default([]),
  strokes: z.array(designPaintSchema).max(16).default([]),
  effects: z.array(designEffectSchema).max(16).default([]),
  blendMode: z.enum(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten']).default('normal'),
  cornerRadius: z.number().finite().min(0).max(10_000).default(0),
  text: z.string().max(20_000).default(''),
  fontSize: z.number().finite().min(4).max(1000).default(16),
  fontWeight: z.number().int().min(100).max(900).default(400),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  pathPoints: z.array(designPathPointSchema).max(20_000).default([]),
  pathSubpaths: z.array(z.array(designPathPointSchema).min(2).max(20_000)).max(256).default([]),
  pathClosed: z.boolean().default(false),
  fillRule: z.enum(['nonzero', 'evenodd']).default('nonzero'),
  assetId: z.string().uuid().nullable().default(null),
  imageFit: z.enum(['fill', 'contain', 'cover']).default('cover'),
  maskId: z.string().uuid().nullable().default(null),
  isMask: z.boolean().default(false),
  layoutMode: z.enum(['none', 'horizontal', 'vertical', 'grid']).default('none'),
  layoutWrap: z.boolean().default(false),
  layoutGap: z.number().finite().min(0).max(10_000).default(16),
  layoutRowGap: z.number().finite().min(0).max(10_000).default(16),
  layoutColumnGap: z.number().finite().min(0).max(10_000).default(16),
  layoutPaddingTop: z.number().finite().min(0).max(10_000).default(24),
  layoutPaddingRight: z.number().finite().min(0).max(10_000).default(24),
  layoutPaddingBottom: z.number().finite().min(0).max(10_000).default(24),
  layoutPaddingLeft: z.number().finite().min(0).max(10_000).default(24),
  layoutGridColumns: z.number().int().min(1).max(64).default(2),
  layoutAlign: z.enum(['start', 'center', 'end', 'space-between']).default('start'),
  clipContent: z.boolean().default(false),
  constraintHorizontal: z.enum(['left', 'right', 'left-right', 'center', 'scale']).default('left'),
  constraintVertical: z.enum(['top', 'bottom', 'top-bottom', 'center', 'scale']).default('top'),
  order: z.number().int().min(0).max(1_000_000),
});

export const designPageSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  width: z.number().finite().min(1).max(100_000),
  height: z.number().finite().min(1).max(100_000),
  background: legacyDesignPaintSchema.default('#f7f7f5'),
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
  assets: z.array(designAssetSchema).max(5_000).default([]),
  guides: z.array(designGuideSchema).max(1_000).default([]),
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
  z.object({ kind: z.literal('reparent'), elementId: z.string().uuid(), parentId: z.string().uuid().nullable(), order: z.number().int().min(0).max(1_000_000).optional() }),
  z.object({ kind: z.literal('add-asset'), asset: designAssetSchema }),
  z.object({ kind: z.literal('delete-asset'), assetId: z.string().uuid() }),
  z.object({ kind: z.literal('add-guide'), guide: designGuideSchema }),
  z.object({ kind: z.literal('update-guide'), guideId: z.string().uuid(), position: z.number().finite().min(-100_000).max(100_000) }),
  z.object({ kind: z.literal('delete-guide'), guideId: z.string().uuid() }),
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

const nullableDimensionSchema = z.preprocess(
  (value) => value === '' || value === undefined ? null : value,
  z.coerce.number().int().min(1).max(100_000).nullable(),
);

export const importDesignAssetSchema = z.object({
  file: z.custom<File>((value) => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as File;
    return typeof candidate.name === 'string'
      && typeof candidate.size === 'number'
      && typeof candidate.arrayBuffer === 'function';
  }, 'Select a design asset.'),
  baseRevision: z.coerce.number().int().min(0),
  width: nullableDimensionSchema.default(null),
  height: nullableDimensionSchema.default(null),
});

export const exportDesignPdfSchema = z.object({
  dataUrl: z.string().max(30 * 1024 * 1024).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
  width: z.number().int().min(1).max(20_000),
  height: z.number().int().min(1).max(20_000),
  name: z.string().trim().min(1).max(180),
});

export const uploadDesignThumbnailSchema = z.object({
  file: z.custom<File>((value) => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as File;
    return candidate.type === 'image/png'
      && typeof candidate.size === 'number'
      && typeof candidate.arrayBuffer === 'function';
  }, 'Select a PNG thumbnail.'),
  revision: z.coerce.number().int().min(0),
});

export type DesignElement = z.infer<typeof designElementSchema>;
export type DesignPage = z.infer<typeof designPageSchema>;
export type DesignPaint = z.infer<typeof designPaintSchema>;
export type DesignEffect = z.infer<typeof designEffectSchema>;
export type DesignPathPoint = z.infer<typeof designPathPointSchema>;
export type DesignAsset = z.infer<typeof designAssetSchema>;
export type DesignGuide = z.infer<typeof designGuideSchema>;
export type DesignDocument = z.infer<typeof designDocumentSchema>;
export type DesignOperation = z.infer<typeof designOperationSchema>;
export type ApplyDesignOperationsInput = z.infer<typeof applyDesignOperationsSchema>;
export type ImportDesignAssetInput = z.infer<typeof importDesignAssetSchema>;
export type ExportDesignPdfInput = z.infer<typeof exportDesignPdfSchema>;
export type UploadDesignThumbnailInput = z.infer<typeof uploadDesignThumbnailSchema>;
