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

const OPENCODE_FALLBACK_OPTIONS: AgentModelOption[] = [
  { provider: 'opencode', value: '', label: 'Default', description: 'Modelo padrao configurado na CLI' },
];

/**
 * Adapter para OpenCode (`opencode`).
 *
 * NOTA: a CLI nao esta instalada na maquina de desenvolvimento atual, entao
 * os flags seguem a documentacao oficial (opencode.ai): modo headless
 * `opencode run --format json <prompt>`, modelo via `-m provider/model`.
 * O parse e tolerante: eventos JSON trazem `part.text` nas partes de texto;
 * qualquer outro formato cai no parser generico de JSON-lines.
 * detect() reporta "nao instalado" graciosamente ate a CLI existir.
 */
export const openCodeAdapter: AgentAdapter = {
  id: 'opencode',
  displayName: 'OpenCode',
  supportsResume: true,

  async detect(): Promise<AgentDetection> {
    return probeVersion('opencode');
  },

  buildCommand(request: AgentRunRequest): AgentCommandSpec {
    const modelArgs = request.model ? ['-m', request.model] : [];
    const args = ['run', '--format', 'json', ...modelArgs, request.prompt];

    return {
      command: 'opencode',
      args,
      displayArgs: ['run', '--format', 'json', ...modelArgs, '<prompt-arg>'],
      promptDelivery: 'args',
    };
  },

  /** Resume exato por session-id, ou a mais recente do diretorio sem id. */
  resumeArgs(agentSessionId?: string): string[] {
    return agentSessionId ? ['--session', agentSessionId] : ['--continue'];
  },

  // OpenCode nao tem flag de effort — aceita a opcao e ignora.
  interactiveCommand(options?: { model?: string; effort?: ModelEffort | null }): AgentCommandSpec {
    return {
      command: 'opencode',
      args: options?.model ? ['-m', options.model] : [],
    };
  },

  parseOutput(stdout: string): ParsedAgentOutput {
    const texts: string[] = [];
    const events: unknown[] = [];
    let sessionId: string | undefined;

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

      if (typeof record.sessionID === 'string') sessionId = record.sessionID;
      const part = record.part;
      if (part && typeof part === 'object') {
        const partRecord = part as Record<string, unknown>;
        if (partRecord.type === 'text' && typeof partRecord.text === 'string' && partRecord.text.trim()) {
          texts.push(partRecord.text.trim());
        }
      }
    }

    if (!texts.length) {
      return parseJsonLinesOutput(stdout);
    }

    const metadata: Record<string, unknown> = { events };
    if (sessionId) metadata.sessionId = sessionId;

    return { content: texts.join('\n'), metadata };
  },

  runMetadata(request: AgentRunRequest): Record<string, unknown> {
    return { permissionMode: 'run-default', allowWritesRequested: request.allowWrites };
  },

  async listModels(): Promise<AgentModelOption[]> {
    const result = await new Promise<{ status: number; stdout: string }>((resolve) => {
      execFile('opencode', ['models'], { timeout: 8_000, encoding: 'utf8' }, (error, stdout) => {
        resolve({ status: error ? 1 : 0, stdout: String(stdout ?? '') });
      });
    });

    if (result.status !== 0 || !result.stdout.trim()) return OPENCODE_FALLBACK_OPTIONS;

    const options = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && line.includes('/'))
      .map((line) => ({ provider: 'opencode' as const, value: line, label: line }));

    return options.length ? options : OPENCODE_FALLBACK_OPTIONS;
  },
};
