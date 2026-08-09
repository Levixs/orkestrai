import { describe, expect, it } from 'vitest';
import {
  agentAdapters,
  getAgentAdapter,
  hasAgentAdapter,
  listAgentAdapters,
  registerAgentAdapter,
} from '$lib/modules/agent-room/application/adapters/registry.js';
import type { AgentAdapter } from '$lib/modules/agent-room/application/adapters/types.js';

function stubAdapter(id: string): AgentAdapter {
  return {
    id,
    displayName: `Stub ${id}`,
    supportsResume: false,
    async detect() {
      return { installed: true };
    },
    buildCommand() {
      return { command: id, args: [] };
    },
    interactiveCommand() {
      return { command: id, args: [] };
    },
    resumeArgs(agentSessionId?: string) {
      return agentSessionId ? ['resume', agentSessionId] : null;
    },
    parseOutput(stdout: string) {
      return { content: stdout };
    },
    runMetadata() {
      return {};
    },
    async listModels() {
      return [];
    },
  };
}

describe('agent adapter registry', () => {
  it('registra claude e codex por padrao', () => {
    expect(hasAgentAdapter('claude')).toBe(true);
    expect(hasAgentAdapter('codex')).toBe(true);
    expect(getAgentAdapter('claude').displayName).toBe('Claude');
    expect(getAgentAdapter('codex').displayName).toBe('Codex');
  });

  it('registra e recupera um novo adapter', () => {
    const adapter = stubAdapter('stub-test');
    registerAgentAdapter(adapter);

    expect(agentAdapters.get('stub-test')).toBe(adapter);
    expect(getAgentAdapter('stub-test')).toBe(adapter);
    expect(hasAgentAdapter('stub-test')).toBe(true);
  });

  it('lista todos os adapters registrados', () => {
    const ids = listAgentAdapters().map((adapter) => adapter.id);
    expect(ids).toContain('claude');
    expect(ids).toContain('codex');
    expect(ids).toContain('stub-test');
  });

  it('lanca erro claro para adapter desconhecido', () => {
    expect(hasAgentAdapter('nao-existe')).toBe(false);
    expect(() => getAgentAdapter('nao-existe')).toThrowError(/Adaptador de agente desconhecido: "nao-existe"/);
  });
});
