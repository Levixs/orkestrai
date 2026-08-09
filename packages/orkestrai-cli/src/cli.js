/**
 * CLI `orkestrai` — ponte entre agentes e o canvas do Orkestrai.
 *
 * Config: sobe os diretorios a partir do cwd procurando
 * `.orkestrai/workspace.json` ({ token, apiUrl }). Variaveis de ambiente
 * ORKESTRAI_TOKEN e ORKESTRAI_API_URL tem precedencia.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

/** Porta livre de verdade: binda na efemera, le o numero e libera. */
export async function findFreePort() {
  return new Promise((resolvePromise, reject) => {
    const srv = createNetServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolvePromise(port));
    });
  });
}

/** Testa se uma porta esta livre (probe de bind em 127.0.0.1). */
export async function isPortFree(port) {
  return new Promise((resolvePromise) => {
    const srv = createNetServer();
    srv.unref();
    srv.once('error', () => resolvePromise(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolvePromise(true)));
  });
}

const USAGE = `orkestrai — ponte entre agentes do Orkestrai

Uso:
  orkestrai list [--agent <seuNodeId>] [--json]
  orkestrai ask <agente> <mensagem> [--from <agente>] [--timeout <ms>] [--raw] [--json]
  orkestrai note read <nodeId>
  orkestrai note write <nodeId> <conteudo>
  orkestrai note edit <nodeId> <trecho-antigo> <trecho-novo>
  orkestrai note create <titulo> [--content <texto>] [--connect <agente|all>]
  orkestrai role show [nome] | role write <nome> <prompt> | role edit <nome> <antigo> <novo>
  orkestrai portal create <url> [--title <titulo>] [--connect <agente|all>]
  orkestrai portal <nodeId> <navigate <url> | eval <js> | dom | screenshot>
  orkestrai notify <mensagem>
  orkestrai recruit <titulo> --from <maestro> [--provider <id>] [--role <papel>] [--replace <agente>] [--json]
  orkestrai dismiss <agente> --from <maestro>
  orkestrai connect <de> <para> --from <maestro>
  orkestrai task list [--json]
  orkestrai task columns [--json]
  orkestrai task add <titulo> [--description <md>] [--assign <agente>] [--note <nota>] [--column <coluna>] [--from <agente>]
  orkestrai task done <taskId>
  orkestrai task move <taskId> <coluna>
  orkestrai task assign <taskId> <agente>
  orkestrai task link <taskId> <nota> | unlink <taskId>
  orkestrai task archive <taskId> | archive-done | history [--json]
  orkestrai floor list [--json]
  orkestrai floor create <nome> [--branch <b>] [--existing] [--clone]
  orkestrai floor preview <floorId> [--target <branch>]
  orkestrai floor land <floorId> [--target <branch>]
  orkestrai floor remove <floorId> [--delete-branch]
  orkestrai port [--check <porta>]  — devolve uma porta livre (ou testa uma)
  orkestrai fs read <path> | fs write <path> <conteudo> | fs search <termo> [--content]
  orkestrai say <texto>  — fala no desktop com a voz configurada
  orkestrai run <taskId>  — re-despacha a tarefa para o responsavel
  orkestrai notes | portals  — listagens rapidas
  orkestrai clip  — le a area de transferencia local
  orkestrai mcp  — servidor MCP em stdio (tools do canvas para agentes MCP)

Config: .orkestrai/workspace.json (token, apiUrl) ou env ORKESTRAI_TOKEN/ORKESTRAI_API_URL.
Identidade: ORKESTRAI_NODE_ID/ORKESTRAI_AGENT_TITLE no ambiente ja definem --from e --agent.
`;

function findBridgeConfig(startDir) {
  let dir = resolve(startDir);
  for (let i = 0; i < 12; i += 1) {
    // .orkestrai/ e o atual; .pantheon/ e o legado (workspaces antigos).
    for (const folder of ['.orkestrai', '.pantheon']) {
      const candidate = resolve(dir, folder, 'workspace.json');
      if (existsSync(candidate)) {
        try {
          return JSON.parse(readFileSync(candidate, 'utf8'));
        } catch {
          return null;
        }
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findRuntimeConfig(env) {
  try {
    // ORKESTRAI_RUNTIME_FILE sobrepoe o caminho ('' desativa — usado em testes).
    const custom = env.ORKESTRAI_RUNTIME_FILE;
    if (custom === '') return {};
    if (!custom && process.env.VITEST) return {};
    const candidate = custom ?? resolve(homedir(), '.orkestrai', 'runtime.json');
    if (existsSync(candidate)) return JSON.parse(readFileSync(candidate, 'utf8'));
  } catch {
    // ignora — cai no workspace.json/default
  }
  return {};
}

function resolveConfig(env, cwd) {
  const fileConfig = findBridgeConfig(cwd) ?? {};
  const runtimeConfig = findRuntimeConfig(env);
  const token = env.ORKESTRAI_TOKEN ?? fileConfig.token;
  // A porta do app empacotado e livre (muda a cada execucao): o runtime.json
  // e regravado a cada boot e tem precedencia sobre o apiUrl do workspace.json.
  const apiUrl = (env.ORKESTRAI_API_URL ?? runtimeConfig.apiUrl ?? fileConfig.apiUrl ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
  if (!token) {
    throw new Error('Token da ponte nao encontrado (.orkestrai/workspace.json ou ORKESTRAI_TOKEN).');
  }
  return { token, apiUrl };
}

async function bridge(config, method, path, body) {
  const response = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Falha na ponte (HTTP ${response.status}).`);
  }
  return payload.data;
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  const known = new Set(['raw', 'json', 'from', 'provider', 'role', 'replace', 'timeout']);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (known.has(arg.slice(2))) {
      if (arg === '--raw') flags.raw = true;
      else if (arg === '--json') flags.json = true;
      else if (arg === '--timeout') flags.timeout = Number(args[++i]);
      else flags[arg.slice(2)] = args[++i];
    } else if (arg.startsWith('--')) {
      // Flags genericos (--content, --connect, --assign, --branch, --clone,
      // --existing, --target, --delete-branch, --agent...): --nome valor ou --nome sozinho.
      const name = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[name] = next;
        i += 1;
      } else {
        flags[name] = true;
      }
    } else positional.push(arg);
  }
  return { flags, positional };
}

export async function run(argv, options = {}) {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const out = options.out ?? console.log;

  const { flags, positional } = parseFlags(argv);
  const [command, ...rest] = positional;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    out(USAGE);
    return 0;
  }

  // Identidade do agente no ambiente (injetada no spawn do terminal): a CLI
  // ja sabe "quem eu sou" — --from e --agent viram opcionais.
  const selfAgent = env.ORKESTRAI_NODE_ID ?? env.ORKESTRAI_AGENT_TITLE;
  if (selfAgent) {
    flags.from = flags.from ?? selfAgent;
    flags.agent = flags.agent ?? selfAgent;
  }

  // `port` e 100% local (nao toca a bridge): resolve ANTES de exigir config.
  if (command === 'port') {
    const check = flags.check ?? rest[0];
    if (check !== undefined && check !== true) {
      const n = Number(check);
      if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('Uso: orkestrai port [--check <porta>]');
      const free = await isPortFree(n);
      out(free ? `${n} livre` : `${n} ocupada`);
      return free ? 0 : 1;
    }
    out(String(await findFreePort()));
    return 0;
  }

  // O MCP e global no Codex e pode subir fora de um workspace Orkestrai.
  // Resolve token/URL apenas quando uma tool realmente tocar a bridge; assim
  // o handshake nunca morre por falta de .orkestrai/workspace.json.
  if (command === 'mcp') {
    const { runMcpServer } = await import('./mcp.js');
    await runMcpServer({
      input: options.input ?? process.stdin,
      write: options.write ?? ((chunk) => process.stdout.write(chunk)),
      bridge: (method, path, body) => bridge(resolveConfig(env, cwd), method, path, body),
      findFreePort,
      selfAgent: selfAgent ?? null,
    });
    return 0;
  }

  const config = resolveConfig(env, cwd);

  switch (command) {
    case 'list': {
      const query = flags.agent ? `?agentNodeId=${encodeURIComponent(flags.agent)}` : '';
      const data = await bridge(config, 'GET', `/api/agent-room/bridge/agents${query}`);
      if (flags.json) {
        out(JSON.stringify(data, null, 2));
      } else {
        out(`Workspace: ${data.workspace.name}`);
        for (const agent of data.agents) {
          const status = agent.sessionAlive ? 'vivo' : 'sem sessao';
          const badge = agent.maestro ? ' [LIDER]' : '';
          out(`- ${agent.title}${badge} [${agent.provider ?? 'shell'}] (${status}) ${agent.nodeId}`);
        }
        if (data.agents.some((agent) => agent.maestro)) {
          out('O agente com [LIDER] e o maestro do time — fale com ele pelo TITULO (nao existe agente chamado "Maestro").');
        }
        if (data.notes?.length) {
          out(`Notas conectadas: ${data.notes.join(', ')}`);
        }
        for (const portal of data.portals ?? []) {
          out(`Portal conectado: ${portal.title} ${portal.url} (${portal.id})`);
        }
        if (data.portals?.length) {
          out(`Controle o portal com: orkestrai portal <nodeId> <navigate <url> | eval <js> | dom | screenshot>`);
        }
      }
      return 0;
    }
    case 'ask': {
      const [to, message] = rest;
      if (!to || !message) throw new Error('Uso: orkestrai ask <agente> <mensagem> [--from <agente>] [--timeout ms]');
      const data = await bridge(config, 'POST', '/api/agent-room/bridge/ask', {
        to,
        message,
        from: flags.from,
        timeoutMs: flags.timeout,
        raw: flags.raw || undefined,
      });
      if (flags.json) out(JSON.stringify(data, null, 2));
      else out(data.reply || '(sem resposta)');
      if (data.timedOut) console.error('(aviso: resposta parcial — timeout ou interrupcao)');
      return 0;
    }
    case 'role': {
      const [action, name, ...values] = rest;
      if (action === 'show') {
        const data = await bridge(config, 'GET', '/api/agent-room/bridge/roles' + (name ? '?name=' + encodeURIComponent(name) : ''));
        if (flags.json) {
          out(JSON.stringify(data, null, 2));
        } else if (Array.isArray(data)) {
          for (const role of data) out('- ' + role.name + ' [' + role.slug + '] (' + role.prompt.length + ' chars)');
        } else {
          out(data.prompt || '(prompt vazio)');
        }
        return 0;
      }
      if (action === 'write') {
        if (!name) throw new Error('Uso: orkestrai role write <nome> <prompt>');
        await bridge(config, 'POST', '/api/agent-room/bridge/roles', { name, prompt: values.join(' ') });
        out('Responsabilidade "' + name + '" salva.');
        return 0;
      }
      if (action === 'edit') {
        if (!name || !values[0]) throw new Error('Uso: orkestrai role edit <nome> <trecho-antigo> <trecho-novo>');
        await bridge(config, 'PATCH', '/api/agent-room/bridge/roles', { name, old: values[0], new: values.slice(1).join(' ') });
        out('Responsabilidade "' + name + '" editada.');
        return 0;
      }
      throw new Error('Uso: orkestrai role <show|write|edit> ...');
    }
    case 'note': {
      const [action, nodeId, ...values] = rest;
      if (action === 'create') {
        const title = [nodeId, ...values].join(' ');
        if (!title) throw new Error('Uso: orkestrai note create <titulo> [--content <texto>] [--connect <agente|all>]');
        const data = await bridge(config, 'POST', '/api/agent-room/bridge/notes', {
          title,
          content: flags.content,
          // Default: nota visivel para o time inteiro (specs/briefs).
          connect: flags.connect ?? 'all',
        });
        out(`Nota criada: "${data.title}" (${data.nodeId})${data.connectedTo ? ` — conectada a ${data.connectedTo}` : ''}`);
        return 0;
      }
      if (!action || !nodeId) throw new Error('Uso: orkestrai note <read|write|edit|create> ...');
      if (action === 'read') {
        const data = await bridge(config, 'GET', `/api/agent-room/bridge/notes/${nodeId}`);
        if (flags.json) out(JSON.stringify(data, null, 2));
        else out(data.content);
        return 0;
      }
      if (action === 'write') {
        const content = values.join(' ');
        const data = await bridge(config, 'PUT', `/api/agent-room/bridge/notes/${nodeId}`, { content });
        out(`Nota ${data.nodeId} atualizada (${data.written} caracteres).`);
        return 0;
      }
      if (action === 'edit') {
        const [oldText, newText] = [values[0], values.slice(1).join(' ')];
        if (!oldText) throw new Error('Uso: orkestrai note edit <nodeId> <trecho-antigo> <trecho-novo>');
        await bridge(config, 'PATCH', `/api/agent-room/bridge/notes/${nodeId}`, { old: oldText, new: newText });
        out(`Nota ${nodeId} editada.`);
        return 0;
      }
      throw new Error(`Acao de nota desconhecida: ${action}`);
    }
    case 'recruit': {
      const [title] = rest;
      if (!title || !flags.from) throw new Error('Uso: orkestrai recruit <titulo> --from <maestro> [--provider id] [--role papel] [--replace agente]');
      const data = await bridge(config, 'POST', '/api/agent-room/bridge/recruit', {
        title,
        from: flags.from,
        provider: flags.provider,
        role: flags.role,
        replace: flags.replace,
      });
      if (flags.json) out(JSON.stringify(data, null, 2));
      else out(`Recruta "${data.title}" ${data.replaced ? 'substituido' : 'criado'}: ${data.nodeId}`);
      return 0;
    }
    case 'dismiss': {
      const [target] = rest;
      if (!target || !flags.from) throw new Error('Uso: orkestrai dismiss <agente> --from <maestro>');
      const data = await bridge(config, 'POST', '/api/agent-room/bridge/dismiss', { target, from: flags.from });
      out(`Agente "${data.dismissed}" dispensado.`);
      return 0;
    }
    case 'connect': {
      const [fromNode, toNode] = rest;
      if (!fromNode || !toNode || !flags.from) throw new Error('Uso: orkestrai connect <de> <para> --from <maestro>');
      const data = await bridge(config, 'POST', '/api/agent-room/bridge/connect', { from: flags.from, source: fromNode, to: toNode });
      out(`Conectados: ${data.from} -> ${data.to}`);
      return 0;
    }
    case 'portal': {
      const [nodeId, action, ...values] = rest;
      if (nodeId === 'create') {
        const url = action;
        if (!url) throw new Error('Uso: orkestrai portal create <url> [--title <titulo>] [--connect <agente|all>]');
        const data = await bridge(config, 'POST', '/api/agent-room/bridge/portal/create', {
          url,
          title: flags.title,
          connect: flags.connect,
          from: flags.from,
        });
        out(`Portal criado: "${data.title}" (${data.nodeId}) — conectado a ${data.connectedTo}`);
        return 0;
      }
      if (!nodeId || !action) throw new Error('Uso: orkestrai portal <nodeId> <navigate <url> | eval <js> | dom | screenshot>');
      const args = action === 'navigate' ? { url: values.join(' ') } : action === 'eval' ? { js: values.join(' ') } : {};
      const data = await bridge(config, 'POST', '/api/agent-room/bridge/portal', { nodeId, action, args });
      if (flags.json) out(JSON.stringify(data, null, 2));
      else out(typeof data.result === 'string' ? data.result : JSON.stringify(data.result ?? data, null, 2));
      return 0;
    }
    case 'notify': {
      const message = rest.join(' ');
      if (!message) throw new Error('Uso: orkestrai notify <mensagem>');
      await bridge(config, 'POST', '/api/agent-room/bridge/notify', { message });
      out('Notificacao enviada.');
      return 0;
    }
    case 'task': {
      const [action, ...values] = rest;
      if (action === 'list') {
        const data = await bridge(config, 'GET', '/api/agent-room/bridge/tasks');
        if (flags.json) {
          out(JSON.stringify(data, null, 2));
        } else {
          for (const task of data) {
            const who = task.assigneeTitle ? ` → ${task.assigneeTitle}` : '';
            out(`- [${task.status}] ${task.title}${who} (${task.id})`);
            if (task.noteTitle) out(`    nota: ${task.noteTitle} (${task.noteId})`);
            for (const image of task.images ?? []) {
              out(`    imagem: ${image}`);
            }
          }
          if (!data.length) out('(quadro vazio)');
        }
        return 0;
      }
      if (action === 'add') {
        const title = values.join(' ');
        if (!title) throw new Error('Uso: orkestrai task add <titulo> [--description <md>] [--assign <agente>] [--note <nota>] [--from <agente>]');
        const data = await bridge(config, 'POST', '/api/agent-room/bridge/tasks', {
          title,
          description: flags.description,
          assignee: flags.assign,
          note: flags.note,
          from: flags.from,
          status: flags.column,
        });
        out(`Tarefa criada: [${data.status}] ${data.title} (${data.id})`);
        return 0;
      }
      if (action === 'columns') {
        const data = await bridge(config, 'GET', '/api/agent-room/bridge/task-columns');
        if (flags.json) out(JSON.stringify(data, null, 2));
        else for (const column of data) out(`- ${column.name ?? column.key} [${column.key}]`);
        return 0;
      }
      if (action === 'move') {
        const [taskId, ...columnParts] = values;
        const status = columnParts.join(' ');
        if (!taskId || !status) throw new Error('Uso: orkestrai task move <taskId> <coluna>');
        const data = await bridge(config, 'PATCH', `/api/agent-room/bridge/tasks/${taskId}`, { status });
        out(`Tarefa movida para [${data.status}].`);
        return 0;
      }
      if (action === 'done') {
        const taskId = values[0];
        if (!taskId) throw new Error('Uso: orkestrai task done <taskId>');
        await bridge(config, 'PATCH', `/api/agent-room/bridge/tasks/${taskId}`, { status: 'done' });
        out('Tarefa marcada como concluida.');
        return 0;
      }
      if (action === 'assign') {
        const [taskId, assignee] = values;
        if (!taskId || !assignee) throw new Error('Uso: orkestrai task assign <taskId> <agente>');
        await bridge(config, 'PATCH', `/api/agent-room/bridge/tasks/${taskId}`, { assignee });
        out('Tarefa atribuida.');
        return 0;
      }
      if (action === 'link') {
        const [taskId, ...noteParts] = values;
        const note = noteParts.join(' ');
        if (!taskId || !note) throw new Error('Uso: orkestrai task link <taskId> <nota (id ou titulo)>');
        await bridge(config, 'PATCH', `/api/agent-room/bridge/tasks/${taskId}`, { note });
        out('Nota vinculada a tarefa.');
        return 0;
      }
      if (action === 'unlink') {
        const taskId = values[0];
        if (!taskId) throw new Error('Uso: orkestrai task unlink <taskId>');
        await bridge(config, 'PATCH', `/api/agent-room/bridge/tasks/${taskId}`, { note: '' });
        out('Nota desvinculada da tarefa.');
        return 0;
      }
      if (action === 'archive') {
        const taskId = values[0];
        if (!taskId) throw new Error('Uso: orkestrai task archive <taskId>');
        await bridge(config, 'POST', `/api/agent-room/bridge/tasks/${taskId}/archive`, {});
        out('Tarefa arquivada (sai do quadro, fica no historico).');
        return 0;
      }
      if (action === 'archive-done') {
        const data = await bridge(config, 'POST', '/api/agent-room/bridge/tasks/archive-done', {});
        out(`Arquivadas ${data.archived} tarefa(s) concluida(s).`);
        return 0;
      }
      if (action === 'history') {
        const data = await bridge(config, 'GET', '/api/agent-room/bridge/tasks/history');
        if (flags.json) {
          out(JSON.stringify(data, null, 2));
        } else {
          for (const task of data) {
            const who = task.assigneeTitle ? ` → ${task.assigneeTitle}` : '';
            const when = String(task.updatedAt ?? '').slice(0, 16).replace('T', ' ');
            out(`- [${task.status}${task.archivedAt ? '/arquivada' : ''}] ${task.title}${who} (${when})`);
            if (task.noteTitle) out(`    nota: ${task.noteTitle} (${task.noteId})`);
          }
          if (!data.length) out('(historico vazio)');
        }
        return 0;
      }
      throw new Error('Uso: orkestrai task <list|columns|add|move|done|assign|link|unlink|archive|archive-done|history> ...');
    }
    case 'floor': {
      const [action, ...values] = rest;
      if (action === 'list') {
        const data = await bridge(config, 'GET', '/api/agent-room/bridge/floors');
        if (flags.json) {
          out(JSON.stringify(data, null, 2));
        } else {
          for (const floor of data) out(`- ${floor.name} [${floor.branch}] ${floor.status} (${floor.id})`);
          if (!data.length) out('(nenhum andar)');
        }
        return 0;
      }
      if (action === 'create') {
        const name = values.join(' ');
        if (!name) throw new Error('Uso: orkestrai floor create <nome> [--branch <b>] [--existing] [--clone]');
        const data = await bridge(config, 'POST', '/api/agent-room/bridge/floors', {
          name,
          branch: flags.branch,
          existingBranch: Boolean(flags.existing),
          cloneLayout: Boolean(flags.clone),
        });
        out(`Andar criado: ${data.name} [${data.branch}] (${data.id})`);
        return 0;
      }
      if (action === 'preview') {
        const floorId = values[0];
        if (!floorId) throw new Error('Uso: orkestrai floor preview <floorId> [--target <branch>]');
        const query = flags.target ? `?target=${encodeURIComponent(flags.target)}` : '';
        const data = await bridge(config, 'GET', `/api/agent-room/bridge/floors/${floorId}/preview${query}`);
        if (flags.json) out(JSON.stringify(data, null, 2));
        else {
          out(`Aterrissagem ${data.from} → ${data.to}${data.targetDirty ? ' (checkout sujo!)' : ''}`);
          if (data.stat) out(data.stat);
          out(data.conflicts.length ? `Conflitos potenciais: ${data.conflicts.join(', ')}` : 'Sem conflitos potenciais.');
        }
        return 0;
      }
      if (action === 'land') {
        const floorId = values[0];
        if (!floorId) throw new Error('Uso: orkestrai floor land <floorId> [--target <branch>]');
        const data = await bridge(config, 'POST', `/api/agent-room/bridge/floors/${floorId}/land`, { targetBranch: flags.target });
        out(`Aterrissado: ${data.branch} → ${data.into}`);
        return 0;
      }
      if (action === 'remove') {
        const floorId = values[0];
        if (!floorId) throw new Error('Uso: orkestrai floor remove <floorId> [--delete-branch]');
        const query = flags['delete-branch'] ? '?deleteBranch=true' : '';
        await bridge(config, 'DELETE', `/api/agent-room/bridge/floors/${floorId}${query}`);
        out('Andar removido.');
        return 0;
      }
      throw new Error('Uso: orkestrai floor <list|create|preview|land|remove> ...');
    }
    case 'fs': {
      const [action, ...values] = rest;
      if (action === 'read') {
        const path = values.join(' ');
        if (!path) throw new Error('Uso: orkestrai fs read <path>');
        const data = await bridge(config, 'GET', `/api/agent-room/bridge/fs/read?path=${encodeURIComponent(path)}`);
        out(data.content ?? '');
        return 0;
      }
      if (action === 'write') {
        const path = values[0];
        const content = values.slice(1).join(' ');
        if (!path || !content) throw new Error('Uso: orkestrai fs write <path> <conteudo>');
        await bridge(config, 'POST', '/api/agent-room/bridge/fs/write', { path, content });
        out(`Escrito: ${path}`);
        return 0;
      }
      if (action === 'search') {
        const query = values.join(' ');
        if (!query) throw new Error('Uso: orkestrai fs search <termo> [--content]');
        const byContent = flags.content ? '&content=1' : '';
        const data = await bridge(config, 'GET', `/api/agent-room/bridge/fs/search?q=${encodeURIComponent(query)}${byContent}`);
        const hits = Array.isArray(data) ? data : (data.results ?? []);
        for (const hit of hits) out(`${hit.path}${hit.line ? `:${hit.line}` : ''}${hit.preview ? `  ${hit.preview}` : ''}`);
        if (!hits.length) out('(nada encontrado)');
        return 0;
      }
      throw new Error('Uso: orkestrai fs <read|write|search> ...');
    }
    case 'say': {
      const text = rest.join(' ');
      if (!text) throw new Error('Uso: orkestrai say "<texto>"');
      await bridge(config, 'POST', '/api/agent-room/bridge/say', { text });
      out('Falado no desktop.');
      return 0;
    }
    case 'run': {
      const taskId = rest[0];
      if (!taskId) throw new Error('Uso: orkestrai run <taskId>');
      await bridge(config, 'POST', `/api/agent-room/bridge/tasks/${taskId}/dispatch`, {});
      out('Tarefa re-despachada para o responsavel.');
      return 0;
    }
    case 'notes':
    case 'portals': {
      const query = selfAgent ? `?agentNodeId=${encodeURIComponent(selfAgent)}` : '';
      const data = await bridge(config, 'GET', `/api/agent-room/bridge/agents${query}`);
      const items = command === 'notes' ? (data.notes ?? []) : (data.portals ?? []);
      for (const item of items) out(`- ${item.title} (${item.id ?? item.nodeId})${item.url ? ` ${item.url}` : ''}`);
      if (!items.length) out(command === 'notes' ? '(sem notas)' : '(sem portais)');
      return 0;
    }
    case 'clip': {
      // Le a area de transferencia LOCAL (onde o agente roda), sem bridge.
      const attempts =
        process.platform === 'darwin'
          ? [['pbpaste', []]]
          : process.platform === 'win32'
            ? [['powershell', ['-command', 'Get-Clipboard']]]
            : [['xclip', ['-selection', 'clipboard', '-o']], ['xsel', ['--clipboard', '--output']]];
      for (const [bin, args] of attempts) {
        try {
          const text = execFileSync(bin, args, { encoding: 'utf8', timeout: 5_000 }).trim();
          out(text || '(area de transferencia vazia)');
          return 0;
        } catch {
          // proxima tentativa
        }
      }
      throw new Error('Nao consegui ler a area de transferencia (sem pbpaste/xclip/xsel/powershell).');
    }
    default:
      out(USAGE);
      return 1;
  }
}
