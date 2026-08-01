import { z } from 'zod';

export const createBoardTaskSchema = z.object({
  title: z.string().trim().min(1, 'Informe o titulo da tarefa.'),
  assigneeNodeId: z.string().trim().nullish(),
  createdBy: z.string().trim().optional(),
});

export const updateBoardTaskSchema = z.object({
  title: z.string().trim().min(1).optional(),
  status: z.enum(['todo', 'doing', 'done']).optional(),
  assigneeNodeId: z.string().trim().nullish(),
  imagePath: z.string().trim().nullish(),
});

export const bridgeBoardTaskSchema = z.object({
  token: z.string().trim().min(1).nullish(),
  title: z.string().trim().min(1, 'Informe o titulo da tarefa.'),
  assignee: z.string().trim().nullish(),
  from: z.string().trim().nullish(),
});

export const bridgeBoardTaskUpdateSchema = z.object({
  token: z.string().trim().min(1).nullish(),
  status: z.enum(['todo', 'doing', 'done']).optional(),
  assignee: z.string().trim().nullish(),
});

export type CreateBoardTaskInput = z.infer<typeof createBoardTaskSchema>;
export type UpdateBoardTaskInput = z.infer<typeof updateBoardTaskSchema>;
export type BridgeBoardTaskInput = z.infer<typeof bridgeBoardTaskSchema>;
export type BridgeBoardTaskUpdateInput = z.infer<typeof bridgeBoardTaskUpdateSchema>;
