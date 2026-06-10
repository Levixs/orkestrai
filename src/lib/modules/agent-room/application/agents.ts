import { spawn } from 'node:child_process';
import type { AgentRunRequest, AgentRunResult } from '../domain/types.js';
import { assertWritableProjectPath, resolveSafeProjectPath } from '../infrastructure/workspace.js';

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
};

type CommandOptions = AgentRunOptions & {
  input?: string;
  displayArgs?: string[];
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
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
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

function stringifyJsonValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const parts = value.map(stringifyJsonValue).filter(Boolean);
    return parts.length ? parts.join('\n') : null;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['result', 'final', 'content', 'response', 'output', 'text', 'message', 'item', 'delta']) {
      const nested = stringifyJsonValue(record[key]);
      if (nested) return nested;
    }
  }
  return null;
}

function parseCodexOutput(stdout: string) {
  const events: unknown[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      continue;
    }
  }

  const text = events
    .map(stringifyJsonValue)
    .filter((value): value is string => Boolean(value))
    .at(-1);

  return {
    content: text ?? stdout.trim(),
    metadata: events.length ? { events } : undefined,
  };
}

function parseJsonLinesOutput(stdout: string) {
  const events: unknown[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      continue;
    }
  }

  const text = events
    .map(stringifyJsonValue)
    .filter((value): value is string => Boolean(value))
    .at(-1);

  return {
    content: text ?? stdout.trim(),
    metadata: events.length ? { events } : undefined,
  };
}

function hasJsonLineError(metadata: Record<string, unknown> | undefined) {
  const events = Array.isArray(metadata?.events) ? metadata.events : [];
  return events.some((event) => event && typeof event === 'object' && (event as Record<string, unknown>).is_error === true);
}

export async function runCodex(request: AgentRunRequest, options: AgentRunOptions = {}): Promise<AgentRunResult> {
  const cwd = resolveWorkingDirectory(request);
  const sandbox = request.allowWrites ? 'danger-full-access' : 'read-only';
  const args = request.allowWrites
    ? ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', '-']
    : ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--sandbox', sandbox, '-'];
  const result = await runCommand('codex', args, cwd, {
    ...options,
    input: request.prompt,
    displayArgs: args.map((arg) => (arg === '-' ? '<prompt-stdin>' : arg)),
  });
  const parsed = parseCodexOutput(result.stdout);
  const error = result.error ?? (result.exitCode === 0 ? undefined : result.stderr.trim() || 'Codex falhou.');

  return {
    agent: 'codex',
    content: error || parsed.content || 'Codex nao retornou conteudo.',
    rawOutput: [result.stdout, result.stderr].filter(Boolean).join('\n'),
    exitCode: result.exitCode,
    error,
    metadata: { ...parsed.metadata, command: 'codex', sandbox, cwd },
  };
}

export async function runClaude(request: AgentRunRequest, options: AgentRunOptions = {}): Promise<AgentRunResult> {
  const cwd = resolveWorkingDirectory(request);
  const args = request.allowWrites
    ? [
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--no-session-persistence',
        '--dangerously-skip-permissions',
      ]
    : ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--no-session-persistence'];
  const result = await runCommand('claude', args, cwd, {
    ...options,
    input: request.prompt,
    displayArgs: ['-p', '<prompt-stdin>', ...args.slice(1)],
  });
  const parsedOutput = parseJsonLinesOutput(result.stdout);
  let content = parsedOutput.content;
  let metadata: Record<string, unknown> | undefined;
  let cliError: string | undefined;

  try {
    const parsed = JSON.parse(result.stdout);
    metadata = parsed && typeof parsed === 'object' ? { ...parsedOutput.metadata, ...(parsed as Record<string, unknown>) } : parsedOutput.metadata;
    if ((parsed as Record<string, unknown>)?.is_error === true && content) {
      cliError = content;
    }
  } catch {
    metadata = parsedOutput.metadata;
  }
  if (!cliError && hasJsonLineError(metadata) && content) {
    cliError = content;
  }

  const error = result.error ?? cliError ?? (result.exitCode === 0 ? undefined : result.stderr.trim() || 'Claude falhou.');

  return {
    agent: 'claude',
    content: error || content || 'Claude nao retornou conteudo.',
    rawOutput: [result.stdout, result.stderr].filter(Boolean).join('\n'),
    exitCode: result.exitCode,
    error,
    metadata: { ...metadata, command: 'claude', permissionMode: request.allowWrites ? 'dangerous-skip' : 'default', cwd },
  };
}

export async function runAgent(request: AgentRunRequest, options: AgentRunOptions = {}): Promise<AgentRunResult> {
  return request.agent === 'codex' ? runCodex(request, options) : runClaude(request, options);
}
