import { z } from 'zod';

// Schemas de filesystem/git — compartilhados backend/frontend.

export const fsWriteSchema = z.object({
  path: z.string().trim().min(1),
  content: z.string(),
});

export const gitPathSchema = z.object({
  path: z.string().trim().min(1),
});

export type FsWriteInput = z.infer<typeof fsWriteSchema>;
export type GitPathInput = z.infer<typeof gitPathSchema>;
