import type { AgentModelOption, AgentName, AgentRunRequest, ModelEffort } from '../../domain/types.js';

/**
 * Resultado da deteccao da CLI de um agente na maquina local.
 */
export type AgentDetection = {
  installed: boolean;
  detail?: string;
};

/**
 * Comando headless one-shot pronto para spawn (sem shell string).
 * `displayArgs` e a versao segura dos args para logs/progresso (prompt mascarado).
 */
export type AgentCommandSpec = {
  command: string;
  args: string[];
  env?: Record<string, string>;
  displayArgs?: string[];
  /**
   * Como o runner entrega o prompt: 'stdin' (padrao, prompt no stdin)
   * ou 'args' (o adapter ja embutiu o prompt nos args; stdin recebe vazio).
   */
  promptDelivery?: 'stdin' | 'args';
};

/**
 * Resultado do parse do stream de saida da CLI.
 * `cliError` sinaliza erro reportado pela propria CLI no payload (ex.: is_error),
 * mesmo quando o exit code e zero.
 */
export type ParsedAgentOutput = {
  content: string;
  metadata?: Record<string, unknown>;
  cliError?: string;
};

/**
 * Adaptador de um agente CLI (claude, codex, ...).
 *
 * O runner generico (agents.ts) cuida do spawn, timeout, kill e progresso;
 * o adapter decide apenas comando/args, parse do stream e metadados.
 * Registrar um novo adapter no registry torna um novo provider utilizavel
 * sem tocar no runner.
 */
export interface AgentAdapter {
  /** Identificador unico do provider (ex.: 'claude', 'codex'). */
  id: AgentName;
  /** Nome amigavel exibido na UI e nas mensagens de erro. */
  displayName: string;
  /** Se a CLI suporta retomar sessoes (resume). Ainda nao usado pelo runner. */
  supportsResume: boolean;
  /** Verifica se a CLI esta instalada (hoje via `<cli> --version`). */
  detect(): Promise<AgentDetection>;
  /** Monta o comando headless one-shot a partir do payload de execucao. */
  buildCommand(request: AgentRunRequest): AgentCommandSpec;
  /** Monta o comando TUI interativo para rodar o agente num terminal PTY. */
  interactiveCommand(options?: { model?: string; effort?: ModelEffort | null }): AgentCommandSpec;
  /** Args de resume: exato com session-id, ou a mais recente do diretorio sem id. */
  resumeArgs(agentSessionId?: string): string[] | null;
  /** Args de resume: exato com session-id, ou a mais recente do diretorio sem id. */
  resumeArgs(agentSessionId?: string): string[] | null;
  /** Extrai o texto final e metadados do stdout (JSON-lines) da CLI. */
  parseOutput(stdout: string): ParsedAgentOutput;
  /** Metadados especificos do provider anexados ao resultado da execucao. */
  runMetadata(request: AgentRunRequest): Record<string, unknown>;
  /** Lista modelos disponiveis (com fallback estatico quando a CLI falha). */
  listModels(): Promise<AgentModelOption[]>;
}
