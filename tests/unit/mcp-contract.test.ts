import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { MCP_TOOLS, runMcpServer } from '../../packages/orkestrai-cli/src/mcp.js';
import {
  bridgeAskSchema,
  bridgeDesignApplySchema,
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
import { bridgeApplyDesignDeliverySchema, bridgeImportDesignMarkupSchema, previewDesignDeliverySchema } from '$lib/modules/agent-room/contracts/schemas/design-delivery.schema.js';
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
  usage: { method: 'GET', path: /\/bridge\/usage$/ },
  ask: { method: 'POST', path: /\/bridge\/ask$/, schema: bridgeAskSchema },
  note_read: { method: 'GET', path: /\/bridge\/notes\/n1$/ },
  note_write: { method: 'PUT', path: /\/bridge\/notes\/n1$/, schema: bridgeNoteWriteSchema },
  note_edit: { method: 'PATCH', path: /\/bridge\/notes\/n1$/, schema: bridgeNoteEditSchema },
  note_create: { method: 'POST', path: /\/bridge\/notes$/, schema: bridgeNoteCreateSchema },
  design_list: { method: 'GET', path: /\/bridge\/designs$/ },
  design_read: { method: 'GET', path: /\/bridge\/designs\/n1$/ },
  design_audit: { method: 'GET', path: /\/bridge\/designs\/n1\/quality$/ },
  design_apply_template: { method: 'POST', path: /\/bridge\/designs\/n1\/quality$/ },
  design_apply_operations: { method: 'PATCH', path: /\/bridge\/designs\/n1$/, schema: bridgeDesignApplySchema },
  design_create_elements: { method: 'PATCH', path: /\/bridge\/designs\/n1$/, schema: bridgeDesignApplySchema },
  design_apply_blueprint: { method: 'PATCH', path: /\/bridge\/designs\/n1$/, schema: bridgeDesignApplySchema },
  design_comment: { method: 'PATCH', path: /\/bridge\/designs\/n1$/, schema: bridgeDesignApplySchema },
  design_propose: { method: 'PATCH', path: /\/bridge\/designs\/n1$/, schema: bridgeDesignApplySchema },
  design_decide_proposal: { method: 'PATCH', path: /\/bridge\/designs\/n1$/, schema: bridgeDesignApplySchema },
  design_import_code: { method: 'POST', path: /\/bridge\/designs\/n1\/delivery\/import$/, schema: bridgeImportDesignMarkupSchema },
  design_generate_code_preview: { method: 'POST', path: /\/bridge\/designs\/n1\/delivery\/preview$/, schema: previewDesignDeliverySchema },
  design_generate_code_apply: { method: 'POST', path: /\/bridge\/designs\/n1\/delivery\/apply$/, schema: bridgeApplyDesignDeliverySchema },
  design_create_element: { method: 'PATCH', path: /\/bridge\/designs\/n1$/, schema: bridgeDesignApplySchema },
  design_update_element: { method: 'PATCH', path: /\/bridge\/designs\/n1$/, schema: bridgeDesignApplySchema },
  design_delete_element: { method: 'PATCH', path: /\/bridge\/designs\/n1$/, schema: bridgeDesignApplySchema },
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
  design_read: { nodeId: 'n1' },
  design_audit: { nodeId: 'n1' },
  design_apply_template: {
    nodeId: 'n1',
    baseRevision: 0,
    templateId: 'product',
  },
  design_apply_operations: {
    nodeId: 'n1',
    baseRevision: 0,
    summary: 'Create color collection',
    operations: [{
      kind: 'add-variable-collection',
      collection: {
        id: '00000000-0000-7000-8000-000000000010',
        name: 'Brand',
        modes: [{ id: '00000000-0000-7000-8000-000000000011', name: 'Light' }],
        defaultModeId: '00000000-0000-7000-8000-000000000011',
        order: 0,
      },
    }],
  },
  design_create_elements: {
    nodeId: 'n1',
    baseRevision: 0,
    pageId: '00000000-0000-7000-8000-000000000001',
    summary: 'Create complete screen',
    elements: [{
      id: '00000000-0000-7000-8000-000000000002',
      type: 'frame',
      name: 'Desktop',
      x: 80,
      y: 80,
      width: 1440,
      height: 1024,
    }],
  },
  design_apply_blueprint: {
    nodeId: 'n1',
    baseRevision: 0,
    pageId: '00000000-0000-7000-8000-000000000001',
    summary: 'Create typed design foundation',
    elements: [{
      id: '00000000-0000-7000-8000-000000000002',
      type: 'frame',
      name: 'Desktop',
      x: 80,
      y: 80,
      width: 1440,
      height: 1024,
    }],
    variableCollections: [{
      id: '00000000-0000-7000-8000-000000000010',
      name: 'Brand',
      modes: [{ id: '00000000-0000-7000-8000-000000000011', name: 'Light' }],
    }],
    variables: [{
      id: '00000000-0000-7000-8000-000000000012',
      collectionId: '00000000-0000-7000-8000-000000000010',
      name: 'Surface/default',
      type: 'color',
      values: { '00000000-0000-7000-8000-000000000011': { kind: 'color', value: '#ffffff' } },
    }],
    bindings: [{ elementId: '00000000-0000-7000-8000-000000000002', property: 'fill', variableId: '00000000-0000-7000-8000-000000000012' }],
    components: [{
      id: '00000000-0000-7000-8000-000000000020',
      name: 'Desktop shell',
      rootElementId: '00000000-0000-7000-8000-000000000002',
    }],
    prototypeFlows: [{
      id: '00000000-0000-7000-8000-000000000030',
      name: 'Primary flow',
      startFrameId: '00000000-0000-7000-8000-000000000002',
    }],
    presentation: { defaultFlowId: '00000000-0000-7000-8000-000000000030' },
  },
  design_comment: {
    nodeId: 'n1', baseRevision: 1,
    pageId: '00000000-0000-7000-8000-000000000001',
    elementId: '00000000-0000-7000-8000-000000000002',
    body: 'Review this layer.',
  },
  design_propose: {
    nodeId: 'n1', baseRevision: 2, title: 'Increase emphasis', description: 'Refine hierarchy.',
    operations: [{ kind: 'update', elementId: '00000000-0000-7000-8000-000000000002', changes: { opacity: 0.9 } }],
  },
  design_decide_proposal: {
    nodeId: 'n1', baseRevision: 3,
    proposalId: '00000000-0000-7000-8000-000000000003', status: 'approved', note: 'Reviewed.',
  },
  design_import_code: {
    nodeId: 'n1',
    baseRevision: 0,
    format: 'html',
    name: 'Account card',
    markup: '<article class="p-4"><h2>Account</h2></article>',
  },
  design_generate_code_preview: {
    nodeId: 'n1',
    framework: 'svelar',
    elementIds: ['00000000-0000-7000-8000-000000000001'],
    outputPath: 'src/lib/AccountCard.svelte',
    componentName: 'AccountCard',
  },
  design_generate_code_apply: {
    nodeId: 'n1',
    baseRevision: 0,
    framework: 'svelar',
    elementIds: ['00000000-0000-7000-8000-000000000001'],
    outputPath: 'src/lib/AccountCard.svelte',
    componentName: 'AccountCard',
    expectedExistingHash: null,
  },
  design_create_element: {
    nodeId: 'n1',
    baseRevision: 0,
    pageId: '00000000-0000-7000-8000-000000000001',
    type: 'frame',
    name: 'Mobile frame',
    x: 24,
    y: 24,
    width: 390,
    height: 844,
  },
  design_update_element: {
    nodeId: 'n1',
    baseRevision: 1,
    elementId: '00000000-0000-7000-8000-000000000002',
    changes: { x: 48 },
    taskId: '00000000-0000-7000-8000-000000000003',
  },
  design_delete_element: {
    nodeId: 'n1',
    baseRevision: 2,
    elementId: '00000000-0000-7000-8000-000000000002',
  },
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
  recruit: { title: 'Novo', floorId: 'f1' },
  dismiss: { agent: 'Velho' },
};

describe('contrato MCP x bridge (todas as tools)', () => {
  it('publica referencia local e schemas de lote sem tocar a bridge', async () => {
    const referenceTool = MCP_TOOLS.find((tool) => tool.name === 'design_reference') as any;
    const elementBatchTool = MCP_TOOLS.find((tool) => tool.name === 'design_create_elements') as any;
    const blueprintTool = MCP_TOOLS.find((tool) => tool.name === 'design_apply_blueprint') as any;
    expect(referenceTool.inputSchema.properties.topic.enum).toContain('elements');
    expect(referenceTool.inputSchema.properties.topic.enum).toContain('concept');
    expect(elementBatchTool.inputSchema.properties.elements.items.required).toEqual(['type', 'name', 'x', 'y', 'width', 'height']);
    expect(blueprintTool.inputSchema.properties.variables.items.required).toContain('values');

    const input = new PassThrough();
    const chunks: string[] = [];
    let bridgeCalled = false;
    const done = runMcpServer({
      input,
      write: (chunk: string) => chunks.push(chunk),
      bridge: async () => {
        bridgeCalled = true;
        return {};
      },
      findFreePort: async () => 45678,
    });
    send(input, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'design_reference', arguments: { topic: 'elements' } } });
    const response = await waitFor(chunks, 1);
    input.end();
    await done;
    expect(bridgeCalled).toBe(false);
    expect(response.result?.content?.[0]?.text).toContain('design_create_elements');
  });

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
