import { z } from 'zod';

export const apiClientMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export const apiClientHeaderSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().max(500),
  value: z.string().max(20_000),
  enabled: z.boolean().default(true),
}).strict();

export const apiClientAuthSchema = z.object({
  type: z.enum(['none', 'bearer', 'basic']).default('none'),
  token: z.string().max(100_000).default(''),
  username: z.string().max(20_000).default(''),
  password: z.string().max(100_000).default(''),
}).strict();

export const apiClientRequestSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(500),
  method: apiClientMethodSchema,
  url: z.string().trim().min(1).max(20_000),
  headers: z.array(apiClientHeaderSchema).max(300).default([]),
  auth: apiClientAuthSchema.default({ type: 'none', token: '', username: '', password: '' }),
  body: z.string().max(2_000_000).default(''),
  bodyMode: z.enum(['none', 'json', 'text', 'xml', 'form']).default('none'),
  sourcePath: z.string().max(4_000).nullish(),
}).strict();

export const executeApiClientRequestSchema = z.object({
  nodeId: z.string().trim().min(1),
  request: apiClientRequestSchema,
  variables: z.record(z.string(), z.string().max(100_000)).default({}),
  timeoutMs: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
});

export const importApiClientCollectionSchema = z.object({
  nodeId: z.string().trim().min(1),
  kind: z.enum(['bruno', 'postman']),
  path: z.string().trim().min(1).max(8_000),
});

export const executeSavedApiClientRequestSchema = z.object({
  requestId: z.string().trim().min(1).max(200),
  variables: z.record(z.string(), z.string().max(100_000)).default({}),
  from: z.string().trim().min(1).max(200).nullish(),
});

export type ApiClientRequestInput = z.infer<typeof apiClientRequestSchema>;
export type ExecuteApiClientRequestInput = z.infer<typeof executeApiClientRequestSchema>;
export type ImportApiClientCollectionInput = z.infer<typeof importApiClientCollectionSchema>;
export type ExecuteSavedApiClientRequestInput = z.infer<typeof executeSavedApiClientRequestSchema>;
