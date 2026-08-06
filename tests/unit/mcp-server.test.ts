import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { runMcpServer, MCP_TOOLS } from '../../packages/orkestrai-cli/src/mcp.js';

/** Roda o servidor MCP com streams em memoria + bridge fake. */
function startMcp(bridgeResult = { ok: true }) {
  const input = new PassThrough();
  const chunks = [];
  const done = runMcpServer({
    input,
    write: (chunk) => chunks.push(chunk),
    bridge: async (method, path) => ({ ...bridgeResult, method, path }),
    findFreePort: async () => 45678,
    selfAgent: 'n1',
  });
  /** NDJSON (spec stdio do MCP): 1 JSON por linha. */
  const send = (message) => {
    input.write(`${JSON.stringify(message)}\n`);
  };
  /** Legado LSP: Content-Length — a entrada ainda e tolerada. */
  const sendLsp = (message) => {
    const body = JSON.stringify(message);
    input.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  };
  /** Espera a resposta com o id dado aparecer no stdout (NDJSON). */
  const waitFor = async (id) => {
    for (let i = 0; i < 100; i += 1) {
      const lines = chunks.join('').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === id) return parsed;
        } catch {
          // linha ainda incompleta
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`resposta ${id} nao chegou`);
  };
  return { send, sendLsp, waitFor, done, input };
}

describe('servidor MCP (orkestrai mcp)', () => {
  it('handshake initialize + tools/list com as tools do canvas', async () => {
    const { send, waitFor, input } = startMcp();
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {} } });
    const init = await waitFor(1);
    expect(init.result.protocolVersion).toBe('2024-11-05');
    expect(init.result.serverInfo.name).toBe('orkestrai');

    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const list = await waitFor(2);
    const names = list.result.tools.map((tool) => tool.name);
    for (const expected of ['ask', 'note_create', 'task_list', 'task_done', 'portal_dom', 'floor_land', 'notify', 'port', 'recruit']) {
      expect(names).toContain(expected);
    }
    input.end();
  });

  it('tools/call roteia para a bridge e devolve texto', async () => {
    const { send, waitFor, input } = startMcp({ tasks: [] });
    send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'task_list', arguments: {} } });
    const response = await waitFor(1);
    const text = response.result.content[0].text;
    const data = JSON.parse(text);
    expect(data.path).toBe('/api/agent-room/bridge/tasks');
    expect(data.method).toBe('GET');
    input.end();
  });

  it('port usa a porta livre local (sem bridge)', async () => {
    const { send, waitFor, input } = startMcp();
    send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'port', arguments: {} } });
    const response = await waitFor(1);
    expect(JSON.parse(response.result.content[0].text).port).toBe(45678);
    input.end();
  });

  it('metodo desconhecido devolve erro JSON-RPC; notificacao nao tem resposta', async () => {
    const { send, waitFor, input } = startMcp();
    send({ jsonrpc: '2.0', method: 'notifications/initialized' }); // sem id: ignorada
    send({ jsonrpc: '2.0', id: 9, method: 'resources/list' });
    const response = await waitFor(9);
    expect(response.error.code).toBe(-32601);
    input.end();
  });

  it('tolerates framing LSP legado (Content-Length) na entrada', async () => {
    const { sendLsp, waitFor, input } = startMcp();
    sendLsp({ jsonrpc: '2.0', id: 5, method: 'ping' });
    const response = await waitFor(5);
    expect(response.result).toEqual({});
    input.end();
  });

  it('lista de tools tem schemas validos', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.name).toMatch(/^[a-z_]+$/);
      expect(tool.description.length).toBeGreaterThan(5);
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});
