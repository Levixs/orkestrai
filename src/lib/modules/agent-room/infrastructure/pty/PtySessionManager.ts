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
  /** true quando a sessão parou de produzir saída (estado neutro de ociosidade). */
  waiting: boolean;
  /** Já produziu algum output — usado na espera de prontidao antes de escrever. */
  hasOutput: boolean;
  /** Rotulos humanos (título do no / workspace) para notificações. */
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
  deliveryTimer: ReturnType<typeof setTimeout> | null;
  deliveryQueue: ComposerDelivery[];
  activeDelivery: ComposerDelivery | null;
  deliveryInProgress: boolean;
  awaitingDeliveryIdle: boolean;
  deliveryReadyAt: number;
  deferredHumanInput: string[];
  humanComposerLength: number;
  lastOutputAt: number;
};

type ComposerDelivery = {
  text: string;
  submitDelayMs: number;
  resolve: () => void;
  reject: (error: Error) => void;
};

export type ComposerDeliveryHandle = {
  submitted: Promise<void>;
  /** Cancela somente enquanto a entrega ainda está aguardando na fila. */
  cancel: () => boolean;
};

export type CreatePtySessionInput = {
  command: string;
  args?: string[];
  cwd: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  /** Rotulos humanos (título do no / workspace) para notificações. */
  label?: string | null;
  workspace?: string | null;
};

const SCROLLBACK_LIMIT = 256 * 1024; // 256 KB por sessão
const SESSION_IDLE_MS = 2_500;
const AGENT_DELIVERY_SETTLE_MS = 8_000;
const SHELL_DELIVERY_SETTLE_MS = 400;

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
    .trim();
}

/**
 * Gerenciador de sessões PTY (node-pty) do Agent Room.
 *
 * As sessões vivem no processo do servidor e sobrevivem a reloads da pagina:
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
      deliveryTimer: null,
      deliveryQueue: [],
      activeDelivery: null,
      deliveryInProgress: false,
      awaitingDeliveryIdle: false,
      deliveryReadyAt: 0,
      deferredHumanInput: [],
      humanComposerLength: 0,
      lastOutputAt: 0,
    };

    ptyProcess.onData((data) => {
      session.lastOutputAt = Date.now();
      session.scrollback = (session.scrollback + data).slice(-SCROLLBACK_LIMIT);
      for (const listener of session.listeners) listener(data);
      this.scheduleAttentionCheck(session);
    });

    ptyProcess.onExit(({ exitCode }) => {
      session.exited = true;
      session.exitCode = exitCode;
      if (session.idleTimer) clearTimeout(session.idleTimer);
      if (session.deliveryTimer) clearTimeout(session.deliveryTimer);
      this.rejectDeliveries(session, new Error(`Sessão PTY ${id} finalizada com código ${exitCode}.`));
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
   * Anexa um ouvinte a sessão. Retorna o scrollback acumulado para replay
   * e uma função de detach. Sessão já finalizada: devolve scrollback e o
   * ouvinte de saída recebe o exit code imediatamente após o replay.
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
    if (session.exited) throw new Error(`Sessão PTY ${id} já finalizada.`);
    this.setWaiting(session, false);
    session.pty.write(data);
  }

  /**
   * Entrada originada no terminal visivel. Enquanto uma entrega automatica
   * está entre o texto e o Enter, as teclas ficam em memória por alguns
   * milissegundos e são reproduzidas logo depois. Isso impede que o rascunho
   * humano seja concatenado a uma mensagem de outro agente.
   */
  writeHumanInput(id: string, data: string): void {
    const session = this.requireSession(id);
    if (session.exited) throw new Error(`Sessão PTY ${id} já finalizada.`);
    if (session.deliveryInProgress) {
      session.deferredHumanInput.push(data);
      return;
    }
    this.writeHumanInputNow(session, data);
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
    if (session.deliveryTimer) clearTimeout(session.deliveryTimer);
    this.rejectDeliveries(session, new Error(`Sessão PTY ${id} encerrada.`));
    if (!session.exited) {
      try {
        session.pty.kill();
      } catch {
        // processo já morreu
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
  writeWithSubmit(id: string, text: string, submitDelayMs = 200): Promise<void> {
    return this.queueWithSubmit(id, text, submitDelayMs).submitted;
  }

  queueWithSubmit(id: string, text: string, submitDelayMs = 200): ComposerDeliveryHandle {
    const session = this.requireSession(id);
    if (session.exited) {
      return {
        submitted: Promise.reject(new Error(`Sessão PTY ${id} já finalizada.`)),
        cancel: () => false,
      };
    }
    const sanitized = sanitizeComposerText(text);
    if (!sanitized) {
      return {
        submitted: Promise.reject(new Error('A mensagem para o terminal está vazia.')),
        cancel: () => false,
      };
    }

    let delivery!: ComposerDelivery;
    const submitted = new Promise<void>((resolve, reject) => {
      delivery = { text: sanitized, submitDelayMs, resolve, reject };
      session.deliveryQueue.push(delivery);
      this.drainDeliveryQueue(session);
    });
    return {
      submitted,
      cancel: () => {
        const index = session.deliveryQueue.indexOf(delivery);
        if (index < 0) return false;
        session.deliveryQueue.splice(index, 1);
        delivery.reject(new Error('Entrega ao terminal cancelada antes do envio.'));
        return true;
      },
    };
  }

  /** Reenvia Enter apenas se não houver um rascunho humano em andamento. */
  submitIfComposerFree(id: string): boolean {
    const session = this.requireSession(id);
    if (session.exited || session.deliveryInProgress || session.humanComposerLength > 0) return false;
    this.write(id, '\r');
    return true;
  }

  /** Mata todas as sessões (shutdown do servidor). */
  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }

  private scheduleAttentionCheck(session: PtySession): void {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      this.setWaiting(session, true);
      this.releaseDeliveryBarrierWhenReady(session);
    }, SESSION_IDLE_MS);
  }

  private setWaiting(session: PtySession, waiting: boolean): void {
    if (session.waiting === waiting) return;
    session.waiting = waiting;
    for (const listener of session.attentionListeners) listener(waiting);
  }

  private drainDeliveryQueue(session: PtySession): void {
    if (
      session.exited ||
      session.deliveryInProgress ||
      session.awaitingDeliveryIdle ||
      session.humanComposerLength > 0
    ) {
      return;
    }
    const delivery = session.deliveryQueue.shift();
    if (!delivery) return;

    session.activeDelivery = delivery;
    session.deliveryInProgress = true;
    try {
      this.write(session.id, delivery.text);
    } catch (error) {
      session.deliveryInProgress = false;
      session.activeDelivery = null;
      delivery.reject(error instanceof Error ? error : new Error(String(error)));
      this.drainDeliveryQueue(session);
      return;
    }

    const timer = setTimeout(() => {
      try {
        this.write(session.id, '\r');
        delivery.resolve();
        session.awaitingDeliveryIdle = true;
        session.deliveryReadyAt = Date.now() + this.deliverySettleMs(session);
        this.scheduleDeliveryBarrierFallback(session);
      } catch (error) {
        delivery.reject(error instanceof Error ? error : new Error(String(error)));
      } finally {
        session.deliveryInProgress = false;
        session.activeDelivery = null;
        if (!session.exited && this.sessions.get(session.id) === session) {
          this.flushDeferredHumanInput(session);
          this.drainDeliveryQueue(session);
        } else {
          session.deferredHumanInput.length = 0;
        }
      }
    }, delivery.submitDelayMs);
    timer.unref?.();
  }

  private scheduleDeliveryBarrierFallback(session: PtySession): void {
    if (session.deliveryTimer) clearTimeout(session.deliveryTimer);
    const delay = Math.max(SESSION_IDLE_MS, session.deliveryReadyAt - Date.now());
    session.deliveryTimer = setTimeout(() => this.releaseDeliveryBarrierWhenReady(session), delay);
    session.deliveryTimer.unref?.();
  }

  private deliverySettleMs(session: PtySession): number {
    return /claude|codex|kimi|opencode|cursor-agent|cline|agy/i.test(session.command)
      ? AGENT_DELIVERY_SETTLE_MS
      : SHELL_DELIVERY_SETTLE_MS;
  }

  private releaseDeliveryBarrierWhenReady(session: PtySession): void {
    if (!session.awaitingDeliveryIdle || session.exited) return;
    const now = Date.now();
    const outputQuiet = session.lastOutputAt === 0 || now - session.lastOutputAt >= SESSION_IDLE_MS;
    if (now < session.deliveryReadyAt || !outputQuiet) {
      this.scheduleDeliveryBarrierFallback(session);
      return;
    }
    session.awaitingDeliveryIdle = false;
    if (session.deliveryTimer) clearTimeout(session.deliveryTimer);
    session.deliveryTimer = null;
    this.drainDeliveryQueue(session);
  }

  private flushDeferredHumanInput(session: PtySession): void {
    const chunks = session.deferredHumanInput.splice(0);
    for (const chunk of chunks) this.writeHumanInputNow(session, chunk);
  }

  private writeHumanInputNow(session: PtySession, data: string): void {
    this.updateHumanComposerState(session, data);
    this.write(session.id, data);
    if (session.humanComposerLength === 0) queueMicrotask(() => this.drainDeliveryQueue(session));
  }

  private updateHumanComposerState(session: PtySession, data: string): void {
    // Remove sequencias CSI/OSC antes de estimar o conteúdo visivel. Não e um
    // parser de terminal: só precisamos distinguir rascunho de controles.
    const visible = data
      .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
      .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\u001B./g, '');
    for (const char of visible) {
      const code = char.charCodeAt(0);
      if (char === '\r' || char === '\n' || code === 0x03 || code === 0x15 || code === 0x1b) {
        session.humanComposerLength = 0;
      } else if (code === 0x7f || code === 0x08) {
        session.humanComposerLength = Math.max(0, session.humanComposerLength - 1);
      } else if (code >= 0x20) {
        session.humanComposerLength += 1;
      }
    }
  }

  private rejectDeliveries(session: PtySession, error: Error): void {
    session.activeDelivery?.reject(error);
    session.activeDelivery = null;
    for (const delivery of session.deliveryQueue.splice(0)) delivery.reject(error);
    session.deliveryInProgress = false;
    session.awaitingDeliveryIdle = false;
  }

  private requireSession(id: string): PtySession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Sessão PTY não encontrada: ${id}`);
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
      /** Já produziu algum output (boot comecou/terminou) — usado na prontidao do ask. */
      hasOutput: session.scrollback.length > 0,
    };
  }
}

// Import dinamico adiado para não carregar o nativo fora do servidor.
// Em producao empacotada (macOS 15+), o spawn-helper do node-pty não executa
// de dentro do bundle não-notarizado — o Electron extrai o módulo para o
// userData e aponta ORKESTRAI_PTY_MODULE para la.
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const { spawn: ptySpawn } = nodeRequire(process.env.ORKESTRAI_PTY_MODULE ?? 'node-pty') as typeof import('node-pty');

/**
 * Singleton process-wide via globalThis: o código SSR e bundlado pelo vite
 * (build/server/chunks) enquanto a camada WS roda direto do src via type
 * stripping — sem isso cada copia teria seu proprio "singleton" e as sessões
 * PTY criadas pelo WS ficariam invisiveis para os services (rotinas, bridge).
 */
const globalRef = globalThis as unknown as { __orkestraiPtyManager?: PtySessionManager };
export const ptySessionManager = (globalRef.__orkestraiPtyManager ??= new PtySessionManager(ptySpawn));
