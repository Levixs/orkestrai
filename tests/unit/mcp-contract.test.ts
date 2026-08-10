import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { runMcpServer } from '../../packages/orkestrai-cli/src/mcp.js';
import {
  bridgeAskSchema,
  bridgeNoteCreateSchema,
  bridgeNoteEditSchema,
  bridgeNoteWriteSchema,
  bridgeNotifySchema,
  bridgeRecruitSchema,
  bridgeDismissSchema,
  bridgeFloorCreateSchema,
  bridgeFloorLandSchema,
} from '$lib/modules/agent-room/contracts/schemas/bridgeSchemas.js';
import { bridgeBoardTaskSchema, bridgeBoardTaskUpdateSchema } from '$lib/modules/agent-room/contracts/schemas/taskSchemas.js';
import { z } from 'zod';

/**
 * Contrato MCP x ponte: TODA tool e dirigida contra a rota e o schema REAIS
 * da bridge (os mesmos zod dos controllers). Se o mapeamento do MCP divergir
 * (campo errado, rota inexistente), este teste quebra — o "data was invalid"
 * nunca mais chega no usuario.
 */

const portalActionSchema = z.object({
  token: z.string().trim().min(1).nullish(),
  nodeId: z.string().trim().min(1),
  action: z.enum(['navigate', 'eval', 'screenshot', 'dom']),
  args: z.record(z.string(), z.unknown()).default({}),
  timeoutMs: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
});
const portalCreateSchema = z.object({
  token: z.string().trim().min(1).nullish(),
  from: z.string().trim().min(1),
  url: z.string().trim().min(1),
  title: z.string().trim().nullish(),
  connect: z.string().trim().nullish(),
});

type Expectation = { method: string; path: RegExp; schema?: z.ZodTypeAny };

const EXPECTED: Record<string, Expectation> = {
  list: { method: 'GET', path: /\/bridge\/agents\?/ },
  ask: { method: 'POST', path: /\/bridge\/ask$/, schema: bridgeAskSchema },
  note_read: { method: 'GET', path: /\/bridge\/notes\/n1$/ },
  note_write: { method: 'PUT', path: /\/bridge\/notes\/n1$/, schema: bridgeNoteWriteSchema },
  note_edit: { method: 'PATCH', path: /\/bridge\/notes\/n1$/, schema: bridgeNoteEditSchema },
  note_create: { method: 'POST', path: /\/bridge\/notes$/, schema: bridgeNoteCreateSchema },
  task_list: { method: 'GET', path: /\/bridge\/tasks$/ },
  task_add: { method: 'POST', path: /\/bridge\/tasks$/, schema: bridgeBoardTaskSchema },
  task_done: { method: 'PATCH', path: /\/bridge\/tasks\/t1$/, schema: bridgeBoardTaskUpdateSchema },
  task_history: { method: 'GET', path: /\/bridge\/tasks\/history$/ },
  portal_create: { method: 'POST', path: /\/bridge\/portal\/create$/, schema: portalCreateSchema },
  portal_navigate: { method: 'POST', path: /\/bridge\/portal$/, schema: portalActionSchema },
  portal_eval: { method: 'POST', path: /\/bridge\/portal$/, schema: portalActionSchema },
  portal_dom: { method: 'POST', path: /\/bridge\/portal$/, schema: portalActionSchema },
  portal_screenshot: { method: 'POST', path: /\/bridge\/portal$/, schema: portalActionSchema },
  floor_list: { method: 'GET', path: /\/bridge\/floors$/ },
  floor_create: { method: 'POST', path: /\/bridge\/floors$/, schema: bridgeFloorCreateSchema },
  floor_preview: { method: 'GET', path: /\/bridge\/floors\/f1\/preview$/ },
  floor_land: { method: 'POST', path: /\/bridge\/floors\/f1\/land$/, schema: bridgeFloorLandSchema },
  notify: { method: 'POST', path: /\/bridge\/notify$/, schema: bridgeNotifySchema },
  recruit: { method: 'POST', path: /\/bridge\/recruit$/, schema: bridgeRecruitSchema },
  dismiss: { method: 'POST', path: /\/bridge\/dismiss$/, schema: bridgeDismissSchema },
};

const TOOL_ARGS: Record<string, Record<string, unknown>> = {
  ask: { agent: 'Codex', message: 'oi' },
  note_read: { nodeId: 'n1' },
  note_write: { nodeId: 'n1', content: 'x' },
  note_edit: { nodeId: 'n1', oldText: 'a', newText: 'b' },
  note_create: { title: 'T', content: 'c' },
  task_add: { title: 'tarefa' },
  task_done: { taskId: 't1' },
  portal_create: { url: 'localhost:3000' },
  portal_navigate: { nodeId: 'n1', url: 'http://localhost:3000' },
  portal_eval: { nodeId: 'n1', js: '1+1' },
  portal_dom: { nodeId: 'n1' },
  portal_screenshot: { nodeId: 'n1' },
  floor_create: { name: 'andar' },
  floor_preview: { floorId: 'f1' },
  floor_land: { floorId: 'f1' },
  notify: { message: 'oi', kind: 'project', title: 'Projeto Atlas' },
  recruit: { title: 'Novo' },
  dismiss: { agent: 'Velho' },
};

describe('contrato MCP x bridge (todas as tools)', () => {
  it('cada tool chama a rota certa com corpo que passa no schema', async () => {
    for (const [tool, expected] of Object.entries(EXPECTED)) {
      const input = new PassThrough();
      const chunks: string[] = [];
      let captured: { method: string; path: string; body: unknown } | null = null;
      const done = runMcpServer({
        input,
        write: (chunk: string) => chunks.push(chunk),
        bridge: async (method: string, path: string, body: unknown) => {
          captured = { method, path, body };
          return { ok: true };
        },
        findFreePort: async () => 45678,
        selfAgent: 'n1',
      });
      send(input, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: TOOL_ARGS[tool] ?? {} } });
      const response = await waitFor(chunks, 1);
      input.end();
      await done.catch(() => {});

      expect(response.error, `${tool}: erro JSON-RPC`).toBeUndefined();
      expect(response.result?.isError, `${tool}: ${response.result?.content?.[0]?.text}`).toBeFalsy();
      expect(captured, `${tool}: bridge nao foi chamada`).not.toBeNull();
      expect(captured!.method, `${tool}: metodo`).toBe(expected.method);
      expect(captured!.path, `${tool}: rota`).toMatch(expected.path);
      if (expected.schema) {
        const parsed = expected.schema.safeParse(captured!.body);
        expect(parsed.success, `${tool}: schema — ${parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 2))}`).toBe(true);
      }
    }
  });

  it('tools de maestro sem identidade (selfAgent null) dao erro claro, nao 422', async () => {
    for (const tool of ['recruit', 'dismiss', 'portal_create']) {
      const input = new PassThrough();
      const chunks: string[] = [];
      const done = runMcpServer({
        input,
        write: (chunk: string) => chunks.push(chunk),
        bridge: async () => ({ ok: true }),
        findFreePort: async () => 45678,
        selfAgent: null,
      });
      send(input, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: TOOL_ARGS[tool] ?? {} } });
      const response = await waitFor(chunks, 1);
      input.end();
      await done.catch(() => {});
      const text = response.result?.content?.[0]?.text ?? '';
      expect(text, `${tool}: deveria explicar a identidade ausente`).toMatch(/identidade|ORKESTRAI_NODE_ID/i);
    }
  });
});

function send(input: PassThrough, message: Record<string, unknown>) {
  input.write(`${JSON.stringify(message)}\n`);
}

async function waitFor(chunks: string[], id: number): Promise<any> {
  for (let i = 0; i < 200; i += 1) {
    for (const line of chunks.join('').split('\n').filter(Boolean)) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.id === id) return parsed;
      } catch {
        // linha incompleta
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`resposta ${id} nao chegou`);
}
