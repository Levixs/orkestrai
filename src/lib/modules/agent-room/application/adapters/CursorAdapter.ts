import { execFile } from 'node:child_process';
import type { AgentModelOption, AgentRunRequest, ModelEffort } from '../../domain/types.js';
import { cliInvocation, probeCliVersion } from '../../infrastructure/agent-path.js';
import type { AgentAdapter, AgentCommandSpec, AgentDetection, ParsedAgentOutput } from './types.js';
import { parseJsonLinesOutput, stringifyJsonValue } from './json-lines.js';

/**
 * Cursor Agent CLI. `cursor-agent` is the stable, collision-free alias kept by
 * Cursor even though recent releases also install a generic `agent` command.
 */
export const cursorAdapter: AgentAdapter = {
  id: 'cursor',
  displayName: 'Cursor',
  supportsResume: true,
  sessionStorage: 'cursor-transcript-jsonl',
  setup: {
    docsUrl: 'https://cursor.com/docs/cli/installation',
    installCommands: {
      darwin: 'curl https://cursor.com/install -fsS | bash',
      windows: "irm 'https://cursor.com/install?win32=true' | iex",
      linux: 'curl https://cursor.com/install -fsS | bash',
    },
  },

  async detect(): Promise<AgentDetection> {
    return probeCliVersion('cursor-agent');
  },

  buildCommand(request: AgentRunRequest): AgentCommandSpec {
    const modelArgs = request.model ? ['--model', request.model] : [];
    const prompt = request.allowWrites
      ? request.prompt
      : `READ-ONLY TASK. Do not modify files or run commands that change files, dependencies, repositories, or system state.\n\n${request.prompt}`;
    const args = [
      '-p',
      ...(request.allowWrites ? ['--force'] : []),
      '--trust',
      '--approve-mcps',
      '--output-format',
      'stream-json',
      ...modelArgs,
      prompt,
    ];
    return {
      command: 'cursor-agent',
      args,
      displayArgs: args.map((arg) => (arg === prompt ? '<prompt-arg>' : arg)),
      promptDelivery: 'args',
    };
  },

  resumeArgs(agentSessionId?: string): string[] | null {
    return agentSessionId ? ['--resume', agentSessionId] : null;
  },

  interactiveCommand(options?: { model?: string; effort?: ModelEffort | null }): AgentCommandSpec {
    return {
      command: 'cursor-agent',
      args: [
        '--force',
        '--trust',
        '--approve-mcps',
        ...(options?.model ? ['--model', options.model] : []),
      ],
    };
  },

  parseOutput(stdout: string): ParsedAgentOutput {
    const parsed = parseJsonLinesOutput(stdout);
    const events = (parsed.metadata?.events ?? []) as Array<Record<string, unknown>>;
    const terminal = [...events].reverse().find((event) => event?.type === 'result');
    const content = stringifyJsonValue(terminal?.result ?? terminal?.output ?? terminal?.text) ?? parsed.content;
    const sessionId = events.find((event) => typeof event?.session_id === 'string')?.session_id;
    const cliError = terminal?.is_error === true || terminal?.subtype === 'error' ? content : undefined;
    return {
      content,
      metadata: {
        ...(parsed.metadata ?? {}),
        ...(typeof sessionId === 'string' ? { sessionId } : {}),
      },
      cliError,
    };
  },

  runMetadata(request: AgentRunRequest): Record<string, unknown> {
    return { permissionMode: request.allowWrites ? 'print-force' : 'prompt-read-only' };
  },

  async listModels(): Promise<AgentModelOption[]> {
    const result = await new Promise<{ status: number; stdout: string }>((resolve) => {
      const inv = cliInvocation('cursor-agent', ['models']);
      execFile(inv.command, inv.args, { timeout: 8_000, encoding: 'utf8', env: inv.env, windowsHide: true }, (error, stdout) => {
        resolve({ status: error ? 1 : 0, stdout: String(stdout ?? '') });
      });
    });
    if (result.status !== 0) return [];
    return parseModelList('cursor', result.stdout);
  },
};

function parseModelList(provider: string, stdout: string): AgentModelOption[] {
  const seen = new Set<string>();
  const options: AgentModelOption[] = [];
  for (const rawLine of stdout.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[>*✓•-]+\s*/, '');
    const match = line.match(/^([a-z0-9][a-z0-9._:/-]+)(?:\s{2,}|\t)(.+)$/i);
    if (!match || /^(model|available|current)$/i.test(match[1]) || seen.has(match[1])) continue;
    seen.add(match[1]);
    options.push({ provider, value: match[1], label: match[2].trim() || match[1] });
  }
  return options;
}
