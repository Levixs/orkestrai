import { execFile } from 'node:child_process';
import type { AgentModelOption, AgentRunRequest, ModelEffort } from '../../domain/types.js';
import { cliInvocation, probeCliVersion } from '../../infrastructure/agent-path.js';
import type { AgentAdapter, AgentCommandSpec, AgentDetection, ParsedAgentOutput } from './types.js';
import { parseJsonLinesOutput, stringifyJsonValue } from './json-lines.js';

export const antigravityAdapter: AgentAdapter = {
  id: 'antigravity',
  displayName: 'Antigravity',
  supportsResume: true,
  efforts: ['low', 'medium', 'high'],
  sessionStorage: 'antigravity-workspace-cache',
  // Sessao normal fica no keyring do SO; nao ha env var oficial de config dir.
  profileStrategy: { kind: 'unsupported' },
  setup: {
    docsUrl: 'https://antigravity.google/docs/cli/getting-started',
    installCommands: {
      darwin: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
      windows: 'irm https://antigravity.google/cli/install.ps1 | iex',
      linux: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    },
  },

  async detect(): Promise<AgentDetection> {
    return probeCliVersion('agy');
  },

  buildCommand(request: AgentRunRequest): AgentCommandSpec {
    const modelArgs = request.model ? ['--model', request.model] : [];
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      ...modelArgs,
      ...(request.effort ? ['--effort', request.effort] : []),
      ...(request.allowWrites ? ['--dangerously-skip-permissions'] : ['--sandbox']),
      request.prompt,
    ];
    return {
      command: 'agy',
      args,
      displayArgs: args.map((arg) => (arg === request.prompt ? '<prompt-arg>' : arg)),
      promptDelivery: 'args',
    };
  },

  resumeArgs(agentSessionId?: string): string[] | null {
    return agentSessionId ? [`--conversation=${agentSessionId}`] : null;
  },

  interactiveCommand(options?: { model?: string; effort?: ModelEffort | null }): AgentCommandSpec {
    return {
      command: 'agy',
      args: [
        '--dangerously-skip-permissions',
        ...(options?.model ? ['--model', options.model] : []),
        ...(options?.effort ? ['--effort', options.effort] : []),
      ],
    };
  },

  parseOutput(stdout: string): ParsedAgentOutput {
    const parsed = parseJsonLinesOutput(stdout);
    const events = (parsed.metadata?.events ?? []) as Array<Record<string, unknown>>;
    const terminal = [...events].reverse().find((event) => event?.type === 'result');
    const content = stringifyJsonValue(terminal?.result ?? terminal?.output ?? terminal?.text) ?? parsed.content;
    const init = events.find((event) => event?.type === 'init');
    const sessionId = init?.conversation_id ?? init?.conversationId ?? init?.session_id;
    const cliError = terminal?.is_error === true || terminal?.status === 'error' ? content : undefined;
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
    return { permissionMode: request.allowWrites ? 'dangerous-skip' : 'sandbox' };
  },

  async listModels(): Promise<AgentModelOption[]> {
    const result = await new Promise<{ status: number; stdout: string }>((resolve) => {
      const inv = cliInvocation('agy', ['models']);
      execFile(inv.command, inv.args, { timeout: 8_000, encoding: 'utf8', env: inv.env, windowsHide: true }, (error, stdout) => {
        resolve({ status: error ? 1 : 0, stdout: String(stdout ?? '') });
      });
    });
    if (result.status !== 0) return [];

    const seen = new Set<string>();
    const options: AgentModelOption[] = [];
    for (const rawLine of result.stdout.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').split(/\r?\n/)) {
      const line = rawLine.trim().replace(/^[>*✓•-]+\s*/, '');
      const match = line.match(/^([a-z0-9][a-z0-9._:/-]+)(?:\s{2,}|\t)(.+)$/i);
      if (!match || /^(model|available|current)$/i.test(match[1]) || seen.has(match[1])) continue;
      seen.add(match[1]);
      options.push({ provider: 'antigravity', value: match[1], label: match[2].trim() || match[1] });
    }
    return options;
  },
};
