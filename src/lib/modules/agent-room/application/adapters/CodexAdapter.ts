import { execFile } from 'node:child_process';

function probeVersion(command: string): Promise<{ installed: boolean; detail?: string }> {
  return new Promise((resolve) => {
    execFile(command, ['--version'], { timeout: 8_000, encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({
        installed: !error,
        detail: error ? String(error.message).split('\n')[0] : String(stdout || stderr).trim(),
      });
    });
  });
}
import type { AgentModelOption, AgentRunRequest, ModelEffort } from '../../domain/types.js';
import type { AgentAdapter, AgentCommandSpec, AgentDetection, ParsedAgentOutput } from './types.js';
import { parseJsonLinesOutput } from './json-lines.js';

const CODEX_FALLBACK_OPTIONS: AgentModelOption[] = [
  { provider: 'codex', value: 'gpt-5.5', label: 'GPT-5.5' },
  { provider: 'codex', value: 'gpt-5-codex', label: 'GPT-5 Codex' },
];

function codexSandbox(request: AgentRunRequest) {
  return request.allowWrites ? 'danger-full-access' : 'read-only';
}

export const codexAdapter: AgentAdapter = {
  id: 'codex',
  displayName: 'Codex',
  supportsResume: false,

  async detect(): Promise<AgentDetection> {
    return probeVersion('codex');
  },

  buildCommand(request: AgentRunRequest): AgentCommandSpec {
    const modelArgs = request.model ? ['--model', request.model] : [];
    const effortArgs = request.effort ? ['-c', `model_reasoning_effort="${request.effort}"`] : [];
    const args = request.allowWrites
      ? [
          'exec',
          '--json',
          '--ephemeral',
          '--skip-git-repo-check',
          ...modelArgs,
          ...effortArgs,
          '--dangerously-bypass-approvals-and-sandbox',
          '-',
        ]
      : [
          'exec',
          '--json',
          '--ephemeral',
          '--skip-git-repo-check',
          ...modelArgs,
          ...effortArgs,
          '--sandbox',
          codexSandbox(request),
          '-',
        ];

    return {
      command: 'codex',
      args,
      displayArgs: args.map((arg) => (arg === '-' ? '<prompt-stdin>' : arg)),
    };
  },

  /** Resume exato por session-id, ou a mais recente sem id. */
  resumeArgs(agentSessionId?: string): string[] {
    return agentSessionId ? ['resume', agentSessionId] : ['resume', '--last'];
  },

  interactiveCommand(options?: { model?: string; effort?: ModelEffort | null }): AgentCommandSpec {
    return {
      command: 'codex',
      args: [
        '--dangerously-bypass-approvals-and-sandbox',
        ...(options?.model ? ['--model', options.model] : []),
        ...(options?.effort ? ['-c', `model_reasoning_effort="${options.effort}"`] : []),
      ],
    };
  },

  parseOutput(stdout: string): ParsedAgentOutput {
    return parseJsonLinesOutput(stdout);
  },

  runMetadata(request: AgentRunRequest): Record<string, unknown> {
    return { sandbox: codexSandbox(request) };
  },

  async listModels(): Promise<AgentModelOption[]> {
    const result = await new Promise<{ status: number; stdout: string }>((resolve) => {
      execFile('codex', ['debug', 'models'], { timeout: 8_000, encoding: 'utf8' }, (error, stdout) => {
        resolve({ status: error ? 1 : 0, stdout: String(stdout ?? '') });
      });
    });

    if (result.status !== 0 || !result.stdout.trim()) return CODEX_FALLBACK_OPTIONS;

    try {
      const parsed = JSON.parse(result.stdout) as {
        models?: Array<{
          slug?: string;
          display_name?: string;
          description?: string;
          visibility?: string;
          supported_reasoning_levels?: Array<{ effort?: string }>;
        }>;
      };
      const options = (parsed.models ?? [])
        .filter((model) => model.slug && model.visibility !== 'hidden')
        .map((model) => ({
          provider: 'codex' as const,
          value: String(model.slug),
          label: String(model.display_name ?? model.slug),
          description: model.description,
          efforts: (model.supported_reasoning_levels ?? [])
            .map((level) => String(level.effort ?? ''))
            .filter(Boolean),
        }));

      return options.length ? options : CODEX_FALLBACK_OPTIONS;
    } catch {
      return CODEX_FALLBACK_OPTIONS;
    }
  },
};
