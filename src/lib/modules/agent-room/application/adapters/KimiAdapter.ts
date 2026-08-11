import type { AgentModelOption, AgentRunRequest, ModelEffort } from '../../domain/types.js';
import { probeCliVersion } from '../../infrastructure/agent-path.js';
import type { AgentAdapter, AgentCommandSpec, AgentDetection, ParsedAgentOutput } from './types.js';

const KIMI_FALLBACK_OPTIONS: AgentModelOption[] = [
  { provider: 'kimi', value: 'kimi-code/k3', label: 'K3 (kimi-code/k3)', description: 'Alias padrao documentado da CLI', efforts: ['low', 'high', 'max'] },
  { provider: 'kimi', value: 'kimi-code/kimi-for-coding', label: 'Kimi for Coding (kimi-code/kimi-for-coding)' },
  { provider: 'kimi', value: 'kimi-code/kimi-for-coding-highspeed', label: 'Kimi for Coding Highspeed (kimi-code/kimi-for-coding-highspeed)' },
];

/**
 * Extrai textos de mensagens assistant do stream-json do kimi.
 * Formato verificado contra a CLI real (0.31.0):
 *   {"role":"assistant","content":"..."}
 *   {"role":"assistant","content":[{"type":"text","text":"..."}], "tool_calls": [...]}
 *   {"role":"tool", ...}
 *   {"role":"meta","type":"session.resume_hint","session_id":"...","command":"kimi -r <id>"}
 */
function extractAssistantText(message: Record<string, unknown>): string | null {
  const content = message.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
          return (part as Record<string, unknown>).text as string;
        }
        return '';
      })
      .filter((part) => part.trim());
    return parts.length ? parts.join('\n').trim() : null;
  }
  return null;
}

export const kimiAdapter: AgentAdapter = {
  id: 'kimi',
  displayName: 'Kimi',
  supportsResume: true,
  sessionStorage: 'kimi-session-dir',
  setup: {
    docsUrl: 'https://www.kimi.com/code/docs/en/',
    installCommands: {
      darwin: 'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash',
      windows: 'irm https://code.kimi.com/kimi-code/install.ps1 | iex',
      linux: 'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash',
    },
  },

  async detect(): Promise<AgentDetection> {
    return probeCliVersion('kimi');
  },

  buildCommand(request: AgentRunRequest): AgentCommandSpec {
    const modelArgs = request.model ? ['-m', request.model] : [];
    // Em `-p` o kimi roda com permissoes `auto` por padrao e NAO aceita
    // --yolo/--auto/--plan (conflito de flags). Ou seja: nao ha sandbox
    // read-only headless como no codex — o confinamento fica por conta do
    // working directory resolvido pelo runner. Kimi nao tem flag de effort.
    const args = ['-p', request.prompt, ...modelArgs, '--output-format', 'stream-json'];

    return {
      command: 'kimi',
      args,
      displayArgs: ['-p', '<prompt-arg>', ...modelArgs, '--output-format', 'stream-json'],
      promptDelivery: 'args',
    };
  },

  /** Resume exato por session-id, ou a mais recente do diretorio sem id. */
  resumeArgs(agentSessionId?: string): string[] {
    return agentSessionId ? ['-r', agentSessionId] : ['--continue'];
  },

  // Kimi nao tem flag de effort — aceita a opcao e ignora.
  interactiveCommand(options?: { model?: string; effort?: ModelEffort | null }): AgentCommandSpec {
    return {
      command: 'kimi',
      args: ['--auto', ...(options?.model ? ['-m', options.model] : [])],
    };
  },

  initialRoleArgs(role) {
    return ['--agent-file', role.instructionFile];
  },

  parseOutput(stdout: string): ParsedAgentOutput {
    const texts: string[] = [];
    const events: unknown[] = [];
    let sessionId: string | undefined;
    let resumeCommand: string | undefined;

    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      events.push(event);
      if (!event || typeof event !== 'object') continue;
      const record = event as Record<string, unknown>;

      if (record.role === 'assistant') {
        const text = extractAssistantText(record);
        if (text) texts.push(text);
      }
      if (record.role === 'meta' && record.type === 'session.resume_hint') {
        if (typeof record.session_id === 'string') sessionId = record.session_id;
        if (typeof record.command === 'string') resumeCommand = record.command;
      }
    }

    const metadata: Record<string, unknown> = {};
    if (events.length) metadata.events = events;
    if (sessionId) metadata.sessionId = sessionId;
    if (resumeCommand) metadata.resumeCommand = resumeCommand;

    return {
      content: texts.length ? texts.join('\n') : stdout.trim(),
      metadata: Object.keys(metadata).length ? metadata : undefined,
    };
  },

  runMetadata(request: AgentRunRequest): Record<string, unknown> {
    return { permissionMode: 'print-auto', allowWritesRequested: request.allowWrites };
  },

  /**
   * Modelos reais do kimi: lidos de ~/.kimi-code/config.toml (secoes
   * [models."<alias>"] com display_name e support_efforts por modelo).
   */
  async listModels(): Promise<AgentModelOption[]> {
    try {
      const { readFileSync, existsSync } = await import('node:fs');
      const { homedir } = await import('node:os');
      const configPath = `${homedir()}/.kimi-code/config.toml`;
      if (!existsSync(configPath)) return KIMI_FALLBACK_OPTIONS;
      const toml = readFileSync(configPath, 'utf8');

      const options: AgentModelOption[] = [];
      // Corpo da secao vai ate a proxima LINHA que abre outra secao TOML.
      const sectionPattern = /\[models\."([^"]+)"\]\n([\s\S]*?)(?=\n\[|$)/g;
      let match: RegExpExecArray | null;
      while ((match = sectionPattern.exec(toml)) !== null) {
        const alias = match[1];
        const body = match[2];
        const displayName = body.match(/display_name\s*=\s*"([^"]+)"/)?.[1];
        const contextSize = body.match(/max_context_size\s*=\s*(\d+)/)?.[1];
        const efforts = [...body.matchAll(/support_efforts\s*=\s*\[([^\]]*)\]/g)]
          .flatMap((effortMatch) => [...effortMatch[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]));
        options.push({
          provider: 'kimi' as const,
          value: alias,
          label: displayName ? `${displayName} (${alias})` : alias,
          description: contextSize ? `Contexto ${Math.round(Number(contextSize) / 1024)}k` : undefined,
          efforts: efforts.length ? efforts : undefined,
        });
      }
      return options.length ? options : KIMI_FALLBACK_OPTIONS;
    } catch {
      return KIMI_FALLBACK_OPTIONS;
    }
  },
};
