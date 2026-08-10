import { execFile } from 'node:child_process';
import type { AgentModelOption, AgentRunRequest, ModelEffort } from '../../domain/types.js';
import { cliInvocation, probeCliVersion } from '../../infrastructure/agent-path.js';
import type { AgentAdapter, AgentCommandSpec, AgentDetection, ParsedAgentOutput } from './types.js';

type DevinModelFamily = {
  variants?: Array<{
    model_uid?: unknown;
    label?: unknown;
    cost_summary?: unknown;
  }>;
};

export const devinAdapter: AgentAdapter = {
  id: 'devin',
  displayName: 'Devin',
  supportsResume: true,
  sessionStorage: 'devin-session-db',
  setup: {
    docsUrl: 'https://docs.devin.ai/cli',
    installCommands: {
      darwin: 'curl -fsSL https://cli.devin.ai/install.sh | bash',
      windows: 'irm https://static.devin.ai/cli/setup.ps1 | iex',
      linux: 'curl -fsSL https://cli.devin.ai/install.sh | bash',
    },
  },

  async detect(): Promise<AgentDetection> {
    return probeCliVersion('devin');
  },

  buildCommand(request: AgentRunRequest): AgentCommandSpec {
    const prompt = request.allowWrites
      ? request.prompt
      : `READ-ONLY TASK. Do not modify files or run commands that change files, dependencies, repositories, or system state.\n\n${request.prompt}`;
    const args = [
      '--permission-mode', request.allowWrites ? 'dangerous' : 'auto',
      '--respect-workspace-trust', 'false',
      ...(request.model ? ['--model', request.model] : []),
      '-p',
      prompt,
    ];
    return {
      command: 'devin',
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
      command: 'devin',
      args: [
        '--permission-mode', 'dangerous',
        '--respect-workspace-trust', 'false',
        ...(options?.model ? ['--model', options.model] : []),
        '--export',
      ],
    };
  },

  parseOutput(stdout: string): ParsedAgentOutput {
    return { content: stdout.trim() };
  },

  runMetadata(request: AgentRunRequest): Record<string, unknown> {
    return { permissionMode: request.allowWrites ? 'dangerous' : 'auto-read-only' };
  },

  async listModels(): Promise<AgentModelOption[]> {
    const result = await new Promise<{ status: number; stdout: string }>((resolve) => {
      const inv = cliInvocation('devin', ['models', 'list', '--format', 'json']);
      execFile(inv.command, inv.args, { timeout: 8_000, encoding: 'utf8', env: inv.env, windowsHide: true }, (error, stdout) => {
        resolve({ status: error ? 1 : 0, stdout: String(stdout ?? '') });
      });
    });
    if (result.status !== 0) return [];

    try {
      const payload = JSON.parse(result.stdout) as { families?: DevinModelFamily[] };
      return (payload.families ?? []).flatMap((family) =>
        (family.variants ?? []).flatMap((variant) => {
          if (typeof variant.model_uid !== 'string' || !variant.model_uid.trim()) return [];
          return [{
            provider: 'devin',
            value: variant.model_uid,
            label: typeof variant.label === 'string' && variant.label.trim() ? variant.label : variant.model_uid,
            ...(typeof variant.cost_summary === 'string' && variant.cost_summary.trim()
              ? { description: variant.cost_summary }
              : {}),
          }];
        })
      );
    } catch {
      return [];
    }
  },
};
