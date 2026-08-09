import type { AgentRunRequest, ModelEffort } from '../../domain/types.js';
import { probeCliVersion } from '../../infrastructure/agent-path.js';
import type { AgentAdapter, AgentCommandSpec, AgentDetection, ParsedAgentOutput } from './types.js';

const CLINE_EFFORTS = ['low', 'medium', 'high', 'xhigh'];
const CLINE_WORKSPACE_ENV = { CLINE_MCP_SETTINGS_PATH: '.cline/mcp.json' };

export const clineAdapter: AgentAdapter = {
  id: 'cline',
  displayName: 'Cline',
  supportsResume: true,
  efforts: CLINE_EFFORTS,
  sessionStorage: 'cline-session-manifest',
  setup: {
    docsUrl: 'https://docs.cline.bot/getting-started/installing-cline',
    installCommands: {
      darwin: 'npm install -g cline',
      windows: 'npm install -g cline',
      linux: 'npm install -g cline',
    },
  },

  async detect(): Promise<AgentDetection> {
    return probeCliVersion('cline');
  },

  buildCommand(request: AgentRunRequest): AgentCommandSpec {
    const args = [
      '--json',
      '--auto-approve',
      String(request.allowWrites),
      ...(request.mode === 'plan' ? ['--plan'] : []),
      ...(request.model ? ['--model', request.model] : []),
      ...(request.effort ? ['--thinking', request.effort] : []),
      ...(!request.allowWrites ? ['--system', 'Analyze and respond without modifying files or running mutating commands.'] : []),
      request.prompt,
    ];
    return {
      command: 'cline',
      args,
      env: CLINE_WORKSPACE_ENV,
      displayArgs: args.map((arg) => (arg === request.prompt ? '<prompt-arg>' : arg)),
      promptDelivery: 'args',
    };
  },

  resumeArgs(agentSessionId?: string): string[] | null {
    return agentSessionId ? ['--id', agentSessionId] : null;
  },

  interactiveCommand(options?: { model?: string; effort?: ModelEffort | null }): AgentCommandSpec {
    return {
      command: 'cline',
      args: [
        '--tui',
        ...(options?.model ? ['--model', options.model] : []),
        ...(options?.effort ? ['--thinking', options.effort] : []),
      ],
      env: CLINE_WORKSPACE_ENV,
    };
  },

  parseOutput(stdout: string): ParsedAgentOutput {
    const events: Array<Record<string, unknown>> = [];
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event && typeof event === 'object') events.push(event as Record<string, unknown>);
      } catch {
        // A CLI pode imprimir avisos de inicializacao antes do stream JSON.
      }
    }
    const messages = events.filter(
      (event) => typeof event.text === 'string' && (event.type === 'say' || event.type === 'run_result')
    );
    const complete = messages.filter((event) => event.partial !== true);
    const final = (complete.length ? complete : messages).at(-1);
    const content = typeof final?.text === 'string' ? final.text.trim() : stdout.trim();
    const sessionEvent = events.find((event) => typeof event.sessionId === 'string' || typeof event.session_id === 'string');
    const sessionId = sessionEvent?.sessionId ?? sessionEvent?.session_id;
    const errorEvent = events.find((event) => event.type === 'error' || event.say === 'error');
    return {
      content,
      metadata: events.length
        ? { events, ...(typeof sessionId === 'string' ? { sessionId } : {}) }
        : undefined,
      cliError: errorEvent && typeof errorEvent.text === 'string' ? errorEvent.text : undefined,
    };
  },

  runMetadata(request: AgentRunRequest): Record<string, unknown> {
    return { permissionMode: request.allowWrites ? 'auto-approve' : 'review-only' };
  },

  async listModels() {
    return [];
  },
};
