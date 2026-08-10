/**
 * Servidor MCP (Model Context Protocol) do Orkestrai — stdio, JSON-RPC 2.0
 * NDJSON (uma mensagem JSON por linha, como manda a spec de transporte stdio
 * do MCP). Expoe as acoes do canvas como TOOLS nativas e tipadas para
 * qualquer agente que fala MCP (Claude Code, Kimi etc.) — em vez de parsear
 * saida de shell.
 *
 * Entrada tolera AMBOS os framings (NDJSON e Content-Length estilo LSP —
 * este ultimo existia na primeira versao; clientes oficiais usam NDJSON).
 * Saida e sempre NDJSON.
 *
 * Sem dependencias: protocolo minimo (initialize, ping, tools/list,
 * tools/call) sobre a bridge HTTP existente (token do workspace).
 */

const PROTOCOL_VERSION = '2024-11-05';

/** Tools expostas (inputSchema JSON Schema). args -> bridge no callTool(). */
const TOOLS = [
  { name: 'list', description: 'Lista agentes do workspace (titulo, provider, sessao viva) e suas notas/portais conectados.', inputSchema: { type: 'object', properties: {} } },
  { name: 'usage', description: 'Consulta cotas dos providers e a recomendacao de roteamento configurada no no Usage do canvas.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ask', description: 'Envia mensagem a outro agente e aguarda a resposta.', inputSchema: { type: 'object', properties: { agent: { type: 'string', description: 'Titulo do agente' }, message: { type: 'string' } }, required: ['agent', 'message'] } },
  { name: 'note_read', description: 'Le uma nota pelo nodeId.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] } },
  { name: 'note_write', description: 'Substitui o conteudo de uma nota.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, content: { type: 'string' } }, required: ['nodeId', 'content'] } },
  { name: 'note_edit', description: 'Edicao pontual: troca um trecho da nota.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, oldText: { type: 'string' }, newText: { type: 'string' } }, required: ['nodeId', 'oldText', 'newText'] } },
  { name: 'note_create', description: 'Cria uma nota no canvas (conecta ao time por padrao).', inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, connect: { type: 'string', description: 'Titulo de agente ou "all"' } }, required: ['title'] } },
  { name: 'task_list', description: 'Lista as tarefas do quadro (kanban) do workspace.', inputSchema: { type: 'object', properties: {} } },
  { name: 'task_columns', description: 'Lista as colunas e chaves validas do kanban.', inputSchema: { type: 'object', properties: {} } },
  { name: 'task_add', description: 'Cria tarefa; com assignee ja despacha para o agente.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string', description: 'Descricao em markdown (checklists, links)' }, assignee: { type: 'string' }, note: { type: 'string', description: 'Nota de spec (id ou titulo)' }, column: { type: 'string', description: 'Chave ou nome da coluna inicial' } }, required: ['title'] } },
  { name: 'task_move', description: 'Move uma tarefa para qualquer coluna do quadro.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, column: { type: 'string' } }, required: ['taskId', 'column'] } },
  { name: 'task_done', description: 'Marca tarefa como concluida.', inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] } },
  { name: 'task_history', description: 'Historico do quadro (concluidas + arquivadas).', inputSchema: { type: 'object', properties: {} } },
  { name: 'portal_create', description: 'Cria um portal (browser) no canvas.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, title: { type: 'string' }, connect: { type: 'string' } }, required: ['url'] } },
  { name: 'portal_navigate', description: 'Abre URL no portal.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, url: { type: 'string' } }, required: ['nodeId', 'url'] } },
  { name: 'portal_eval', description: 'Executa JS na pagina do portal e retorna o resultado.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, js: { type: 'string' } }, required: ['nodeId', 'js'] } },
  { name: 'portal_dom', description: 'Devolve o HTML atual do portal.', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] } },
  { name: 'portal_screenshot', description: 'Captura a tela do portal (base64).', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] } },
  { name: 'floor_list', description: 'Lista andares (worktrees git) do workspace.', inputSchema: { type: 'object', properties: {} } },
  { name: 'floor_create', description: 'Cria um andar (worktree isolada com branch propria).', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'floor_preview', description: 'Previa da aterrissagem (merge) com conflitos.', inputSchema: { type: 'object', properties: { floorId: { type: 'string' } }, required: ['floorId'] } },
  { name: 'floor_land', description: 'Aterrissa o andar (merge da branch).', inputSchema: { type: 'object', properties: { floorId: { type: 'string' } }, required: ['floorId'] } },
  { name: 'notify', description: 'Notificacao nativa de atencao ou conclusao do projeto. task_done ja notifica tarefas.', inputSchema: { type: 'object', properties: { message: { type: 'string' }, kind: { type: 'string', enum: ['info', 'attention', 'project', 'task'] }, title: { type: 'string' } }, required: ['message'] } },
  { name: 'port', description: 'Devolve uma porta livre para subir servidores.', inputSchema: { type: 'object', properties: {} } },
  { name: 'recruit', description: '(maestro) Recruta agente novo no canvas.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, provider: { type: 'string', description: 'Id de um provider registrado no Orkestrai.' }, role: { type: 'string' } }, required: ['title'] } },
  { name: 'dismiss', description: '(maestro) Dispensa um agente.', inputSchema: { type: 'object', properties: { agent: { type: 'string' } }, required: ['agent'] } },
];

/** Mapeia tool -> chamada da bridge (mesmos endpoints da CLI). */
async function callTool(bridge, findFreePort, selfAgent, name, args = {}) {
  switch (name) {
    case 'list': {
      const query = selfAgent ? `?agentNodeId=${encodeURIComponent(selfAgent)}` : '';
      return bridge('GET', `/api/agent-room/bridge/agents${query}`);
    }
    case 'usage':
      return bridge('GET', '/api/agent-room/bridge/usage');
    case 'ask':
      return bridge('POST', '/api/agent-room/bridge/ask', { to: args.agent, message: args.message, from: selfAgent });
    case 'note_read':
      return bridge('GET', `/api/agent-room/bridge/notes/${encodeURIComponent(args.nodeId)}`);
    case 'note_write':
      return bridge('PUT', `/api/agent-room/bridge/notes/${encodeURIComponent(args.nodeId)}`, { content: args.content });
    case 'note_edit':
      return bridge('PATCH', `/api/agent-room/bridge/notes/${encodeURIComponent(args.nodeId)}`, { old: args.oldText, new: args.newText });
    case 'note_create':
      return bridge('POST', '/api/agent-room/bridge/notes', { title: args.title, content: args.content, connect: args.connect ?? 'all', from: selfAgent });
    case 'task_list':
      return bridge('GET', '/api/agent-room/bridge/tasks');
    case 'task_columns':
      return bridge('GET', '/api/agent-room/bridge/task-columns');
    case 'task_add':
      return bridge('POST', '/api/agent-room/bridge/tasks', { title: args.title, description: args.description, assignee: args.assignee, note: args.note, status: args.column, from: selfAgent });
    case 'task_move':
      return bridge('PATCH', `/api/agent-room/bridge/tasks/${encodeURIComponent(args.taskId)}`, { status: args.column });
    case 'task_done':
      return bridge('PATCH', `/api/agent-room/bridge/tasks/${encodeURIComponent(args.taskId)}`, { status: 'done' });
    case 'task_history':
      return bridge('GET', '/api/agent-room/bridge/tasks/history');
    case 'portal_create': {
      if (!selfAgent) throw new Error('identidade do agente desconhecida (ORKESTRAI_NODE_ID ausente) — crie o portal pelo canvas ou pela CLI dentro do terminal de um agente.');
      return bridge('POST', '/api/agent-room/bridge/portal/create', { url: args.url, title: args.title, connect: args.connect, from: selfAgent });
    }
    case 'portal_navigate':
      return bridge('POST', '/api/agent-room/bridge/portal', { nodeId: args.nodeId, action: 'navigate', args: { url: args.url } });
    case 'portal_eval':
      return bridge('POST', '/api/agent-room/bridge/portal', { nodeId: args.nodeId, action: 'eval', args: { js: args.js } });
    case 'portal_dom':
      return bridge('POST', '/api/agent-room/bridge/portal', { nodeId: args.nodeId, action: 'dom', args: {} });
    case 'portal_screenshot':
      return bridge('POST', '/api/agent-room/bridge/portal', { nodeId: args.nodeId, action: 'screenshot', args: {} });
    case 'floor_list':
      return bridge('GET', '/api/agent-room/bridge/floors');
    case 'floor_create':
      return bridge('POST', '/api/agent-room/bridge/floors', { name: args.name });
    case 'floor_preview':
      return bridge('GET', `/api/agent-room/bridge/floors/${encodeURIComponent(args.floorId)}/preview`);
    case 'floor_land':
      return bridge('POST', `/api/agent-room/bridge/floors/${encodeURIComponent(args.floorId)}/land`, {});
    case 'notify':
      return bridge('POST', '/api/agent-room/bridge/notify', { message: args.message, kind: args.kind, title: args.title });
    case 'port':
      return { port: await findFreePort() };
    case 'recruit': {
      if (!selfAgent) throw new Error('identidade do agente desconhecida (ORKESTRAI_NODE_ID ausente) — recruit so funciona dentro do terminal do maestro.');
      return bridge('POST', '/api/agent-room/bridge/recruit', { title: args.title, provider: args.provider, role: args.role, from: selfAgent });
    }
    case 'dismiss': {
      if (!selfAgent) throw new Error('identidade do agente desconhecida (ORKESTRAI_NODE_ID ausente) — dismiss so funciona dentro do terminal do maestro.');
      return bridge('POST', '/api/agent-room/bridge/dismiss', { target: args.agent, from: selfAgent });
    }
    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}

/** Envia uma mensagem JSON-RPC em NDJSON (spec stdio do MCP: 1 JSON por linha). */
function writeMessage(write, message) {
  write(`${JSON.stringify(message)}\n`);
}

/**
 * Loop principal do servidor MCP. Io injetavel para testes:
 * input = stream legivel (stdin), write = funcao de escrita (stdout).
 * bridge = (method, path, body) => Promise<data> ja autenticada.
 */
export async function runMcpServer({ input, write, bridge, findFreePort, selfAgent = null, version = '0.0.1' }) {
  let buffer = Buffer.alloc(0);
  const pending = [];
  let waiter = null;
  let ended = false;

  const pump = () => {
    for (;;) {
      // Framing LSP legado (Content-Length) — tolerado na entrada.
      if (buffer.subarray(0, 15).toString('utf8').startsWith('Content-Length')) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const header = buffer.subarray(0, headerEnd).toString('utf8');
        const length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1] ?? 0);
        if (!length) {
          buffer = buffer.subarray(headerEnd + 4);
          continue;
        }
        if (buffer.length < headerEnd + 4 + length) return;
        const body = buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString('utf8');
        buffer = buffer.subarray(headerEnd + 4 + length);
        try {
          pending.push(JSON.parse(body));
        } catch {
          // mensagem quebrada — ignora
        }
        waiter?.();
        continue;
      }
      // NDJSON (spec stdio do MCP): uma mensagem por linha.
      const lineEnd = buffer.indexOf('\n');
      if (lineEnd === -1) return;
      const line = buffer.subarray(0, lineEnd).toString('utf8').trim();
      buffer = buffer.subarray(lineEnd + 1);
      if (!line) continue;
      try {
        pending.push(JSON.parse(line));
      } catch {
        // linha quebrada — ignora
      }
      waiter?.();
    }
  };

  input.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    pump();
  });
  const markEnded = () => {
    ended = true;
    waiter?.();
  };
  input.on('end', markEnded);
  input.on('close', markEnded);

  const nextMessage = () =>
    new Promise((resolveNext) => {
      if (pending.length) return resolveNext(pending.shift());
      if (ended) return resolveNext(null);
      waiter = () => {
        waiter = null;
        resolveNext(pending.length ? pending.shift() : null);
      };
      pump();
    });

  input.resume?.();

  for (;;) {
    const message = await nextMessage();
    if (!message) {
      if (ended) break; // stdin fechou: encerra limpo (clients e testes)
      continue;
    }
    // Notificacoes (sem id) nao tem resposta.
    if (message.id === undefined || message.id === null) continue;
    const reply = (result) => writeMessage(write, { jsonrpc: '2.0', id: message.id, result });
    const fail = (error) =>
      writeMessage(write, { jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } });
    try {
      if (message.method === 'initialize') {
        reply({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'orkestrai', version },
        });
      } else if (message.method === 'ping') {
        reply({});
      } else if (message.method === 'tools/list') {
        reply({ tools: TOOLS });
      } else if (message.method === 'tools/call') {
        const { name, arguments: toolArgs } = message.params ?? {};
        try {
          const data = await callTool(bridge, findFreePort, selfAgent, name, toolArgs);
          reply({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
        } catch (error) {
          reply({ content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true });
        }
      } else {
        writeMessage(write, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Metodo nao suportado: ${message.method}` } });
      }
    } catch (error) {
      fail(error);
    }
  }
}

export const MCP_TOOLS = TOOLS;
