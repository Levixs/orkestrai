import { randomUUID } from 'node:crypto';
import type { IPty } from 'node-pty';
import { agentEnv, resolveCommand } from '../agent-path.ts';

// PATH aumentado e resolucao de comando (registro/PATHEXT/.cmd) foram movidos
// para ../agent-path.ts, compartilhado com o Modo Maestro (application/agents.ts)
// e a deteccao de CLIs (application/adapters/*).

export type PtySessionInfo = {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
  createdAt: string;
  exited: boolean;
  exitCode: number | null;
  /** true quando a sessao parou de produzir saida (agente aguardando atencao). */
  waiting: boolean;
  /** Rotulos humanos (titulo do no / workspace) para notificacoes. */
  label?: string | null;
  workspace?: string | null;
};

export type PtySessionListener = (data: string) => void;
export type PtyExitListener = (exitCode: number) => void;
export type PtyAttentionListener = (waiting: boolean) => void;

type PtySession = PtySessionInfo & {
  pty: IPty;
  scrollback: string;
  listeners: Set<PtySessionListener>;
  exitListeners: Set<PtyExitListener>;
  attentionListeners: Set<PtyAttentionListener>;
  idleTimer: ReturnType<typeof setTimeout> | null;
};

export type CreatePtySessionInput = {
  command: string;
  args?: string[];
  cwd: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  /** Rotulos humanos (titulo do no / workspace) para notificacoes. */
  label?: string | null;
  workspace?: string | null;
};

const SCROLLBACK_LIMIT = 256 * 1024; // 256 KB por sessao
const ATTENTION_IDLE_MS = 2_500; // silencio apos output => aguardando atencao

/**
 * Texto seguro para composers de TUI (Claude/Codex/Kimi): remove bytes de
 * controle (atalhos como Ctrl+X abrem o editor externo do Claude!) e achata
 * newlines — \n solto num composer e um Enter (submit parcial da mensagem).
 */
export function sanitizeComposerText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, 4000);
}

/**
 * Gerenciador de sessoes PTY (node-pty) do Agent Room.
 *
 * As sessoes vivem no processo do servidor e sobrevivem a reloads da pagina:
 * o cliente reconecta via attach() e recebe o scrollback acumulado.
 * Singleton `ptySessionManager` para uso no transporte (WS) e nas rotas.
 */
export class PtySessionManager {
  private sessions = new Map<string, PtySession>();
  private spawnPty: typeof import('node-pty').spawn;

  constructor(spawnPty: typeof import('node-pty').spawn) {
    this.spawnPty = spawnPty;
  }

  create(input: CreatePtySessionInput): PtySessionInfo {
    const id = randomUUID();
    const cols = input.cols ?? 120;
    const rows = input.rows ?? 30;

    const env = { ...agentEnv(), ...input.env } as Record<string, string>;
    const target = resolveCommand(input.command, input.args ?? [], env);
    const ptyProcess = this.spawnPty(target.command, target.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: input.cwd,
      env,
    });

    const session: PtySession = {
      id,
      command: input.command,
      args: input.args ?? [],
      cwd: input.cwd,
      cols,
      rows,
      createdAt: new Date().toISOString(),
      exited: false,
      exitCode: null,
      waiting: false,
      label: input.label ?? null,
      workspace: input.workspace ?? null,
      pty: ptyProcess,
      scrollback: '',
      listeners: new Set(),
      exitListeners: new Set(),
      attentionListeners: new Set(),
      idleTimer: null,
    };

    ptyProcess.onData((data) => {
      session.scrollback = (session.scrollback + data).slice(-SCROLLBACK_LIMIT);
      for (const listener of session.listeners) listener(data);
      this.scheduleAttentionCheck(session);
    });

    ptyProcess.onExit(({ exitCode }) => {
      session.exited = true;
      session.exitCode = exitCode;
      if (session.idleTimer) clearTimeout(session.idleTimer);
      this.setWaiting(session, false);
      for (const listener of session.exitListeners) listener(exitCode);
    });

    this.sessions.set(id, session);
    return this.toInfo(session);
  }

  list(): PtySessionInfo[] {
    return [...this.sessions.values()].map((session) => this.toInfo(session));
  }

  get(id: string): PtySessionInfo | null {
    const session = this.sessions.get(id);
    return session ? this.toInfo(session) : null;
  }

  /**
   * Anexa um ouvinte a sessao. Retorna o scrollback acumulado para replay
   * e uma funcao de detach. Sessao ja finalizada: devolve scrollback e o
   * ouvinte de saida recebe o exit code imediatamente apos o replay.
   */
  attach(
    id: string,
    onData: PtySessionListener,
    onExit?: PtyExitListener,
    onAttention?: PtyAttentionListener
  ): { scrollback: string; detach: () => void } {
    const session = this.requireSession(id);
    session.listeners.add(onData);
    if (onExit) session.exitListeners.add(onExit);
    if (onAttention) session.attentionListeners.add(onAttention);

    const scrollback = session.scrollback;
    if (session.exited && onExit) {
      queueMicrotask(() => onExit(session.exitCode ?? 0));
    }

    return {
      scrollback,
      detach: () => {
        session.listeners.delete(onData);
        if (onExit) session.exitListeners.delete(onExit);
        if (onAttention) session.attentionListeners.delete(onAttention);
      },
    };
  }

  write(id: string, data: string): void {
    const session = this.requireSession(id);
    if (session.exited) throw new Error(`Sessao PTY ${id} ja finalizada.`);
    this.setWaiting(session, false);
    session.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.requireSession(id);
    if (session.exited) return;
    session.cols = cols;
    session.rows = rows;
    session.pty.resize(cols, rows);
  }

  kill(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    if (session.idleTimer) clearTimeout(session.idleTimer);
    if (!session.exited) {
      try {
        session.pty.kill();
      } catch {
        // processo ja morreu
      }
    }
    this.sessions.delete(id);
    return true;
  }

  /**
   * Texto + Enter em writes separados (~200ms): TUIs como o Codex tratam o
   * \r colado ao texto como quebra de linha no composer em vez de submit.
   * O texto passa por sanitizeComposerText: newlines soltas virariam Enters
   * (submit parcial no Claude) e bytes de controle disparam atalhos do TUI.
   */
  writeWithSubmit(id: string, text: string, submitDelayMs = 200): void {
    this.write(id, sanitizeComposerText(text));
    const timer = setTimeout(() => {
      try {
        this.write(id, '\r');
      } catch {
        // sessao morreu entre o texto e o Enter
      }
    }, submitDelayMs);
    timer.unref?.();
  }

  /** Mata todas as sessoes (shutdown do servidor). */
  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }

  private scheduleAttentionCheck(session: PtySession): void {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => this.setWaiting(session, true), ATTENTION_IDLE_MS);
  }

  private setWaiting(session: PtySession, waiting: boolean): void {
    if (session.waiting === waiting) return;
    session.waiting = waiting;
    if (waiting) {
      // O processo principal do Electron converte isso em notificacao nativa.
      const who = session.label ?? `Terminal ${session.command}`;
      const where = session.workspace ? ` [${session.workspace}]` : '';
      console.log(`[orkestrai:attention]${where} ${who}`);
    }
    for (const listener of session.attentionListeners) listener(waiting);
  }

  private requireSession(id: string): PtySession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Sessao PTY nao encontrada: ${id}`);
    return session;
  }

  private toInfo(session: PtySession): PtySessionInfo {
    return {
      id: session.id,
      command: session.command,
      args: session.args,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      createdAt: session.createdAt,
      exited: session.exited,
      exitCode: session.exitCode,
      waiting: session.waiting,
    };
  }
}

// Import dinamico adiado para nao carregar o nativo fora do servidor.
// Em producao empacotada (macOS 15+), o spawn-helper do node-pty nao executa
// de dentro do bundle nao-notarizado — o Electron extrai o modulo para o
// userData e aponta ORKESTRAI_PTY_MODULE para la.
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const { spawn: ptySpawn } = nodeRequire(process.env.ORKESTRAI_PTY_MODULE ?? 'node-pty') as typeof import('node-pty');

/**
 * Singleton process-wide via globalThis: o codigo SSR e bundlado pelo vite
 * (build/server/chunks) enquanto a camada WS roda direto do src via type
 * stripping — sem isso cada copia teria seu proprio "singleton" e as sessoes
 * PTY criadas pelo WS ficariam invisiveis para os services (rotinas, bridge).
 */
const globalRef = globalThis as unknown as { __orkestraiPtyManager?: PtySessionManager };
export const ptySessionManager = (globalRef.__orkestraiPtyManager ??= new PtySessionManager(ptySpawn));
