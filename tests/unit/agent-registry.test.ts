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
  it('registra todos os providers embutidos por padrao', () => {
    const expected = ['claude', 'codex', 'kimi', 'opencode', 'cursor', 'antigravity', 'cline'];
    for (const id of expected) expect(hasAgentAdapter(id)).toBe(true);
    expect(getAgentAdapter('cursor').displayName).toBe('Cursor');
    expect(getAgentAdapter('antigravity').displayName).toBe('Antigravity');
    expect(getAgentAdapter('cline').displayName).toBe('Cline');
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
