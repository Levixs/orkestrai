import type { AgentRunRequest, ModelEffort } from '../../domain/types.js';
import { probeCliVersion } from '../../infrastructure/agent-path.js';
import type { AgentAdapter, AgentCommandSpec, AgentDetection, ParsedAgentOutput } from './types.js';

/**
 * Adapter da CLI oficial `@github/copilot`.
 *
 * `--session-id` e seguro para o canvas: se o UUID ja existe, o Copilot retoma
 * exatamente aquela conversa; se ainda nao existe, cria a sessao com aquele
 * mesmo UUID. Assim nao dependemos de `--continue`, que poderia abrir a
 * conversa mais recente de outro agente no mesmo diretorio.
 */
export const copilotAdapter: AgentAdapter = {
  id: 'copilot',
  displayName: 'GitHub Copilot',
  supportsResume: true,
  profileStrategy: { kind: 'configDir', envVar: 'COPILOT_HOME', defaultDir: '~/.copilot' },
  setup: {
    docsUrl: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli',
    installCommands: {
      darwin: 'brew install copilot-cli',
      windows: 'winget install GitHub.Copilot',
      linux: 'npm install -g @github/copilot',
    },
  },

  async detect(): Promise<AgentDetection> {
    return probeCliVersion('copilot');
  },

  buildCommand(request: AgentRunRequest): AgentCommandSpec {
    const prompt = request.allowWrites
      ? request.prompt
      : `READ-ONLY TASK. Do not modify files, dependencies, repositories, or system state.\n\n${request.prompt}`;
    const args = [
      '--prompt', prompt,
      '--silent',
      '--no-ask-user',
      '--no-remote',
      ...(request.mode === 'plan' ? ['--plan'] : []),
      ...(request.model ? [`--model=${request.model}`] : []),
      ...(request.allowWrites ? ['--yolo'] : []),
    ];
    return {
      command: 'copilot',
      args,
      displayArgs: args.map((arg) => (arg === prompt ? '<prompt-arg>' : arg)),
      promptDelivery: 'args',
    };
  },

  resumeArgs(agentSessionId?: string): string[] {
    return agentSessionId ? ['--session-id', agentSessionId] : [];
  },

  freshSessionArgs(agentSessionId: string): string[] {
    return ['--session-id', agentSessionId];
  },

  interactiveCommand(options?: { model?: string; effort?: ModelEffort | null }): AgentCommandSpec {
    return {
      command: 'copilot',
      args: ['--yolo', '--no-remote', ...(options?.model ? [`--model=${options.model}`] : [])],
    };
  },

  parseOutput(stdout: string): ParsedAgentOutput {
    return { content: stdout.trim() };
  },

  runMetadata(request: AgentRunRequest): Record<string, unknown> {
    return { permissionMode: request.allowWrites ? 'yolo' : 'read-only-instruction' };
  },

  async listModels() {
    return [];
  },
};
