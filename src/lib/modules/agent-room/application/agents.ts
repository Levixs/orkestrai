import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { AgentRunRequest, AgentRunResult } from '../domain/types.js';
import { assertWritableProjectPath, resolveSafeProjectPath } from '../infrastructure/workspace.js';
import { agentEnv, resolveCommand, IS_WIN } from '../infrastructure/agent-path.js';
import { getAgentAdapter } from './adapters/registry.js';

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
};

type CommandOptions = AgentRunOptions & {
  input?: string;
  displayArgs?: string[];
  env?: Record<string, string>;
};

export type AgentCommandProgressEvent = {
  type: 'command_started' | 'stdout' | 'stderr' | 'timeout' | 'aborted' | 'command_finished';
  command: string;
  text?: string;
  exitCode?: number;
};

export type AgentRunOptions = {
  signal?: AbortSignal;
  onProgress?: (event: AgentCommandProgressEvent) => void;
};

const DEFAULT_AGENT_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_GRACE_MS = 5_000;

function agentTimeoutMs() {
  const configured = Number(process.env.AGENT_ROOM_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_AGENT_TIMEOUT_MS;
}

function formatTimeout(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

function resolveWorkingDirectory(request: AgentRunRequest) {
  return request.allowWrites
    ? assertWritableProjectPath(request.workingDirectory)
    : resolveSafeProjectPath(request.workingDirectory);
}

function terminateProcessGroup(child: ReturnType<typeof spawn>, signal: NodeJS.Signals) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Process already exited.
    }
  }
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options: CommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const timeoutMs = agentTimeoutMs();
    const env = options.env ? { ...agentEnv(), ...options.env } : agentEnv();
    const target = resolveCommand(command, args, env);
    const child = spawn(target.command, target.args, {
      cwd,
      shell: false,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Unix: grupo de processo (kill por -pid). Windows nao tem grupos assim e
      // detached abriria um console; escondemos e caimos no child.kill.
      detached: !IS_WIN,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let spawnError: string | undefined;
    let killEscalation: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    let aborted = false;

    const emit = (event: AgentCommandProgressEvent) => options.onProgress?.(event);

    emit({ type: 'command_started', command, text: `${command} ${(options.displayArgs ?? args).join(' ')}`.trim() });

    child.stdin?.end(options.input ?? '');

    const killWithEscalation = (signal: NodeJS.Signals) => {
      terminateProcessGroup(child, signal);
      if (!killEscalation) {
        killEscalation = setTimeout(() => terminateProcessGroup(child, 'SIGKILL'), KILL_GRACE_MS);
      }
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      spawnError = `${command} excedeu o limite de ${formatTimeout(timeoutMs)} e foi interrompido.`;
      emit({ type: 'timeout', command, text: spawnError });
      killWithEscalation('SIGTERM');
    }, timeoutMs);

    const abortListener = () => {
      aborted = true;
      spawnError = `${command} foi interrompido pelo usuario.`;
      emit({ type: 'aborted', command, text: spawnError });
      killWithEscalation('SIGTERM');
    };

    if (options.signal?.aborted) {
      abortListener();
    } else {
      options.signal?.addEventListener('abort', abortListener, { once: true });
    }

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      emit({ type: 'stdout', command, text });
    });
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      emit({ type: 'stderr', command, text });
    });
    child.on('error', (error) => {
      spawnError = error.message.includes('ENOENT')
        ? `Comando "${command}" nao encontrado. Instale a CLI antes de executar este agente.`
        : error.message;
      emit({ type: 'stderr', command, text: spawnError });
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (killEscalation) clearTimeout(killEscalation);
      options.signal?.removeEventListener('abort', abortListener);
      const rawExitCode = typeof code === 'number' ? code : 1;
      const exitCode = timedOut ? 124 : aborted ? 130 : rawExitCode;
      if (!timedOut && !aborted) {
        emit({ type: 'command_finished', command, exitCode });
      }
      resolve({
        stdout,
        stderr,
        exitCode,
        error: spawnError,
      });
    });
  });
}

export async function runAgent(request: AgentRunRequest, options: AgentRunOptions = {}): Promise<AgentRunResult> {
  const cwd = resolveWorkingDirectory(request);
  return executeAgent(request, cwd, options);
}

/**
 * Runs a one-shot agent inside a workspace path already authorized by the
 * persisted workspace record. The containment check stays here so callers
 * cannot accidentally turn a request path into arbitrary filesystem access.
 */
export async function runAgentInWorkspace(
  request: AgentRunRequest,
  workspaceRoot: string,
  options: AgentRunOptions = {},
): Promise<AgentRunResult> {
  const root = realpathSync(resolve(workspaceRoot));
  const cwd = realpathSync(resolve(request.workingDirectory ?? workspaceRoot));
  const nested = relative(root, cwd);
  if (nested.startsWith('..') || isAbsolute(nested)) {
    throw new Error('The council execution directory must stay inside the workspace.');
  }
  return executeAgent(request, cwd, options);
}

async function executeAgent(request: AgentRunRequest, cwd: string, options: AgentRunOptions): Promise<AgentRunResult> {
  const adapter = getAgentAdapter(request.agent);
  const spec = adapter.buildCommand(request);
  const result = await runCommand(spec.command, spec.args, cwd, {
    ...options,
    input: spec.promptDelivery === 'args' ? '' : request.prompt,
    displayArgs: spec.displayArgs,
    env: spec.env,
  });
  const parsed = adapter.parseOutput(result.stdout);
  const error =
    result.error ??
    parsed.cliError ??
    (result.exitCode === 0 ? undefined : result.stderr.trim() || `${adapter.displayName} falhou.`);

  return {
    agent: adapter.id,
    memberId: request.memberId,
    memberTitle: request.memberTitle,
    content: error || parsed.content || `${adapter.displayName} nao retornou conteudo.`,
    rawOutput: [result.stdout, result.stderr].filter(Boolean).join('\n'),
    exitCode: result.exitCode,
    error,
    metadata: {
      ...parsed.metadata,
      command: adapter.id,
      ...adapter.runMetadata(request),
      cwd,
      model: request.model,
      effort: request.effort,
    },
  };
}

export async function runCodex(request: AgentRunRequest, options: AgentRunOptions = {}): Promise<AgentRunResult> {
  return runAgent({ ...request, agent: 'codex' }, options);
}

export async function runClaude(request: AgentRunRequest, options: AgentRunOptions = {}): Promise<AgentRunResult> {
  return runAgent({ ...request, agent: 'claude' }, options);
}
