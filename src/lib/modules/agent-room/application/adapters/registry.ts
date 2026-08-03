import type { AgentAdapter } from './types.js';
import { claudeAdapter } from './ClaudeAdapter.js';
import { codexAdapter } from './CodexAdapter.js';
import { kimiAdapter } from './KimiAdapter.js';
import { openCodeAdapter } from './OpenCodeAdapter.js';

/**
 * Registry de adaptadores de agente. Novos providers (kimi, opencode, ...)
 * entram aqui via registerAgentAdapter sem tocar no runner nem nas rotas.
 */
export const agentAdapters = new Map<string, AgentAdapter>();

export function registerAgentAdapter(adapter: AgentAdapter) {
  agentAdapters.set(adapter.id, adapter);
}

export function hasAgentAdapter(id: string) {
  return agentAdapters.has(id);
}

export function getAgentAdapter(id: string): AgentAdapter {
  const adapter = agentAdapters.get(id);
  if (!adapter) {
    const known = [...agentAdapters.keys()].join(', ') || '(nenhum)';
    throw new Error(`Adaptador de agente desconhecido: "${id}". Registrados: ${known}.`);
  }
  return adapter;
}

export function listAgentAdapters(): AgentAdapter[] {
  return [...agentAdapters.values()];
}

registerAgentAdapter(claudeAdapter);
registerAgentAdapter(codexAdapter);
registerAgentAdapter(kimiAdapter);
registerAgentAdapter(openCodeAdapter);
