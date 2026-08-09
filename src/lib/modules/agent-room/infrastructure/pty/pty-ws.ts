/**
 * Camada de transporte WebSocket para sessões PTY do Agent Room.
 *
 * Arquivo deliberadamente autocontido (só depende de PtySessionManager e ws)
 * para ser importado tanto pelo vite (dev) quanto pelo servidor de producao
 * (scripts/orkestrai-server.mjs, rodado com type stripping do Node 24+).
 *
 * Protocolo (frames JSON texto):
 *   C->S {type:'create', command, args?, cwd, cols?, rows?, env?}
 *   C->S {type:'attach', sessionId}
 *   C->S {type:'input', sessionId, data}
 *   C->S {type:'resize', sessionId, cols, rows}
 *   C->S {type:'kill', sessionId}
 *   C->S {type:'list'}
 *   S->C {type:'created'|'attached', session, scrollback}
 *   S->C {type:'output', sessionId, data}
 *   S->C {type:'exit', sessionId, exitCode}
 *   S->C {type:'killed', sessionId}
 *   S->C {type:'list', sessions}
 *   S->C {type:'error', message}
 */
import { existsSync, statSync } from 'node:fs';
import type { WebSocket } from 'ws';
import { ptySessionManager, type PtySessionInfo } from './PtySessionManager.ts';
import { agentSessionTracker } from './AgentSessionTracker.ts';

export const PTY_WS_PATH = '/ws/agent-room/pty';

type ClientMessage =
  | { type: 'create'; command: string; args?: string[]; cwd: string; cols?: number; rows?: number; env?: Record<string, string>; provider?: string; label?: string; workspace?: string }
  | { type: 'attach'; sessionId: string }
  | { type: 'input'; sessionId: string; data: string }
  | { type: 'resize'; sessionId: string; cols: number; rows: number }
  | { type: 'kill'; sessionId: string }
  | { type: 'list' };

export function isPtyWsPath(pathname: string): boolean {
  return pathname === PTY_WS_PATH;
}

// Registro global de sockets vivos + broadcast para eventos de workspace
// (ex.: edge "talking"). Vai em globalThis porque o bundle SSR e a camada
// type-stripped carregam copias separadas deste módulo no mesmo processo.
const wsGlobal = globalThis as unknown as {
  __orkestraiWsClients?: Set<WebSocket>;
  __orkestraiBroadcast?: (payload: Record<string, unknown>) => void;
};
const allSockets = (wsGlobal.__orkestraiWsClients ??= new Set<WebSocket>());
wsGlobal.__orkestraiBroadcast = (payload) => {
  const frame = JSON.stringify(payload);
  for (const client of allSockets) {
    if (client.readyState === client.OPEN) client.send(frame);
  }
};

/**
 * Aceita apenas origens same-origin ou loopback (o servidor só escuta em
 * 127.0.0.1; sem origin — ex.: curl/testes — também passa).
 */
export function isAllowedPtyWsOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    if (host && originHost === host) return true;
    const hostname = new URL(origin).hostname;
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function resolveCwd(cwd: unknown): string {
  if (typeof cwd !== 'string' || !cwd.trim()) {
    throw new Error('Informe um diretório de trabalho (cwd) para a sessão PTY.');
  }
  const resolved = cwd.trim();
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`Diretório de trabalho não existe: ${resolved}`);
  }
  return resolved;
}

export function handlePtyConnection(socket: WebSocket): void {
  const detachers = new Map<string, () => void>();
  allSockets.add(socket);
  socket.on('close', () => allSockets.delete(socket));

  const send = (payload: Record<string, unknown>) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
  };

  const attachSession = (sessionId: string) => {
    if (detachers.has(sessionId)) return;
    const { scrollback, detach } = ptySessionManager.attach(
      sessionId,
      (data) => send({ type: 'output', sessionId, data }),
      (exitCode) => send({ type: 'exit', sessionId, exitCode }),
      (waiting) => send({ type: 'idle', sessionId, idle: waiting })
    );
    detachers.set(sessionId, detach);
    return scrollback;
  };

  socket.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw));
    } catch {
      send({ type: 'error', message: 'Mensagem inválida (JSON esperado).' });
      return;
    }

    try {
      switch (message.type) {
        case 'create': {
          if (typeof message.command !== 'string' || !message.command.trim()) {
            throw new Error('Informe o comando da sessão PTY.');
          }
          const session = ptySessionManager.create({
            command: message.command.trim(),
            args: Array.isArray(message.args) ? message.args.map(String) : [],
            cwd: resolveCwd(message.cwd),
            cols: message.cols,
            rows: message.rows,
            env: message.env,
            label: typeof message.label === 'string' ? message.label : null,
            workspace: typeof message.workspace === 'string' ? message.workspace : null,
          });
          const scrollback = attachSession(session.id);
          send({ type: 'created', session, scrollback });

          // Encerramento normal pode ser unload/reload solicitado pelo usuário
          // e não deve gerar ruído. Só uma saída anormal vira notificação; para
          // conclusões e pedidos de atenção, o agente usa `orkestrai notify`.
          const label = typeof message.label === 'string' && message.label.trim() ? message.label.trim() : null;
          if (label) {
            const workspaceName = typeof message.workspace === 'string' && message.workspace.trim() ? message.workspace.trim() : 'Orkestrai';
            ptySessionManager.attach(
              session.id,
              () => {},
              (exitCode) => {
                if (exitCode !== 0) {
                  console.log(`[orkestrai:notify] [${workspaceName}] ${label} encerrou com erro (código ${exitCode}).`);
                }
              }
            );
          }

          // Rastreia o session-id REAL da CLI para resume exato futuro.
          const provider =
            typeof message.provider === 'string' && ['claude', 'codex', 'kimi', 'opencode'].includes(message.provider)
              ? message.provider
              : null;
          if (provider) {
            agentSessionTracker.watch(session.id, provider, session.cwd, Date.now(), (agentSessionId) => {
              // Broadcast global: o socket criador pode já ter sido fechado
              // (o no remonta em modo attach ao receber o sessionId).
              wsGlobal.__orkestraiBroadcast?.({
                type: 'agentSession',
                workspaceId: typeof message.workspace === 'string' ? message.workspace : null,
                sessionId: session.id,
                agentSessionId,
                provider,
              });
              send({ type: 'agentSession', sessionId: session.id, agentSessionId, provider });
            });
          }
          break;
        }
        case 'attach': {
          const info = requireSession(message.sessionId);
          const scrollback = attachSession(message.sessionId);
          send({ type: 'attached', session: info, scrollback });
          break;
        }
        case 'input': {
          ptySessionManager.writeHumanInput(message.sessionId, String(message.data ?? ''));
          break;
        }
        case 'resize': {
          const cols = Math.max(2, Math.min(500, Number(message.cols) || 80));
          const rows = Math.max(2, Math.min(200, Number(message.rows) || 24));
          ptySessionManager.resize(message.sessionId, cols, rows);
          break;
        }
        case 'kill': {
          const killed = ptySessionManager.kill(message.sessionId);
          agentSessionTracker.unwatch(message.sessionId);
          detachers.get(message.sessionId)?.();
          detachers.delete(message.sessionId);
          send({ type: 'killed', sessionId: message.sessionId, killed });
          break;
        }
        case 'list': {
          send({ type: 'list', sessions: ptySessionManager.list() });
          break;
        }
        default:
          send({ type: 'error', message: `Tipo de mensagem desconhecido: ${(message as { type?: string }).type}` });
      }
    } catch (error) {
      send({ type: 'error', message: error instanceof Error ? error.message : 'Erro na sessão PTY.' });
    }
  });

  socket.on('close', () => {
    for (const detach of detachers.values()) detach();
    detachers.clear();
  });

  function requireSession(sessionId: string): PtySessionInfo {
    const info = ptySessionManager.get(sessionId);
    if (!info) throw new Error(`Sessão PTY não encontrada: ${sessionId}`);
    return info;
  }
}
