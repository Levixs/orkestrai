import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do workspace.'),
  workingDir: z.string().trim().min(1, 'Informe o diretorio de trabalho.'),
  icon: z.string().trim().nullish(),
  instructions: z.string().nullish(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).optional(),
  workingDir: z.string().trim().min(1).optional(),
  icon: z.string().trim().nullish(),
  instructions: z.string().nullish(),
  syncAgentInstructionFiles: z.boolean().optional(),
});

export const canvasNodeTypeSchema = z.enum(['terminal', 'note', 'fileTree', 'editor', 'diff', 'portal', 'loop', 'group', 'shape', 'tasks']);

export const createCanvasNodeSchema = z.object({
  type: canvasNodeTypeSchema,
  title: z.string().trim().nullish(),
  x: z.coerce.number().optional(),
  y: z.coerce.number().optional(),
  width: z.coerce.number().positive().optional(),
  height: z.coerce.number().positive().optional(),
  zIndex: z.coerce.number().int().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const updateCanvasNodeSchema = z.object({
  type: canvasNodeTypeSchema.optional(),
  title: z.string().trim().nullish(),
  x: z.coerce.number().optional(),
  y: z.coerce.number().optional(),
  width: z.coerce.number().positive().optional(),
  height: z.coerce.number().positive().optional(),
  zIndex: z.coerce.number().int().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const canvasEdgeStyleSchema = z.enum(['cord', 'circuit']);

export const createCanvasEdgeSchema = z.object({
  sourceNodeId: z.string().trim().min(1, 'Informe o no de origem.'),
  targetNodeId: z.string().trim().min(1, 'Informe o no de destino.'),
  style: canvasEdgeStyleSchema.default('cord'),
});

export const updateCanvasEdgeSchema = z.object({
  style: canvasEdgeStyleSchema,
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type CreateCanvasNodeInput = z.infer<typeof createCanvasNodeSchema>;
export type UpdateCanvasNodeInput = z.infer<typeof updateCanvasNodeSchema>;
export type CreateCanvasEdgeInput = z.infer<typeof createCanvasEdgeSchema>;
export type UpdateCanvasEdgeInput = z.infer<typeof updateCanvasEdgeSchema>;
