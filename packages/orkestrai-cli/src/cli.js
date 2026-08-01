/**
 * CLI `orkestrai` — ponte entre agentes e o canvas do Orkestrai.
 *
 * Config: sobe os diretorios a partir do cwd procurando
 * `.orkestrai/workspace.json` ({ token, apiUrl }). Variaveis de ambiente
 * ORKESTRAI_TOKEN e ORKESTRAI_API_URL tem precedencia.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const USAGE = `orkestrai — ponte entre agentes do Orkestrai

Uso:
  orkestrai list [--agent <seuNodeId>] [--json]
  orkestrai ask <agente> <mensagem> [--from <agente>] [--timeout <ms>] [--raw] [--json]
  orkestrai note read <nodeId>
  orkestrai note write <nodeId> <conteudo>
  orkestrai note edit <nodeId> <trecho-antigo> <trecho-novo>
  orkestrai note create <titulo> [--content <texto>] [--connect <agente>]
  orkestrai role show [nome] | role write <nome> <prompt> | role edit <nome> <antigo> <novo>
  orkestrai portal <nodeId> <navigate <url> | eval <js> | dom | screenshot>
  orkestrai notify <mensagem>
  orkestrai recruit <titulo> --from <maestro> [--provider <id>] [--role <papel>] [--replace <agente>] [--json]
  orkestrai dismiss <agente> --from <maestro>
  orkestrai connect <de> <para> --from <maestro>
  orkestrai task list [--json]
  orkestrai task add <titulo> [--assign <agente>] [--from <agente>]
  orkestrai task done <taskId>
  orkestrai task assign <taskId> <agente>
  orkestrai floor list [--json]
  orkestrai floor create <nome> [--branch <b>] [--existing] [--clone]
  orkestrai floor preview <floorId> [--target <branch>]
  orkestrai floor land <floorId> [--target <branch>]
  orkestrai floor remove <floorId> [--delete-branch]

Config: .orkestrai/workspace.json (token, apiUrl) ou env ORKESTRAI_TOKEN/ORKESTRAI_API_URL.
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

function resolveConfig(env, cwd) {
  const fileConfig = findBridgeConfig(cwd) ?? {};
  const token = env.ORKESTRAI_TOKEN ?? fileConfig.token;
  const apiUrl = (env.ORKESTRAI_API_URL ?? fileConfig.apiUrl ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
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
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--raw') flags.raw = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--from') flags.from = args[++i];
    else if (arg === '--provider') flags.provider = args[++i];
    else if (arg === '--role') flags.role = args[++i];
    else if (arg === '--replace') flags.replace = args[++i];
    else if (arg === '--timeout') flags.timeout = Number(args[++i]);
    else positional.push(arg);
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
          out(`- ${agent.title} [${agent.provider ?? 'shell'}] (${status}) ${agent.nodeId}`);
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
        if (!title) throw new Error('Uso: orkestrai note create <titulo> [--content <texto>] [--connect <agente>]');
        const data = await bridge(config, 'POST', '/api/agent-room/bridge/notes', {
          title,
          content: flags.content,
          connect: flags.connect,
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
          }
          if (!data.length) out('(quadro vazio)');
        }
        return 0;
      }
      if (action === 'add') {
        const title = values.join(' ');
        if (!title) throw new Error('Uso: orkestrai task add <titulo> [--assign <agente>] [--from <agente>]');
        const data = await bridge(config, 'POST', '/api/agent-room/bridge/tasks', {
          title,
          assignee: flags.assign,
          from: flags.from,
        });
        out(`Tarefa criada: [${data.status}] ${data.title} (${data.id})`);
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
      throw new Error('Uso: orkestrai task <list|add|done|assign> ...');
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
    default:
      out(USAGE);
      return 1;
  }
}
