import type { AgentAdapter } from './types.js';
import { claudeAdapter } from './ClaudeAdapter.js';
import { codexAdapter } from './CodexAdapter.js';
import { kimiAdapter } from './KimiAdapter.js';
import { openCodeAdapter } from './OpenCodeAdapter.js';
import { cursorAdapter } from './CursorAdapter.js';
import { antigravityAdapter } from './AntigravityAdapter.js';
import { clineAdapter } from './ClineAdapter.js';

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

/**
 * Presets antigos e receitas embutidas podem guardar apenas o id do provider.
 * Materializa o comando interativo atual quando nao ha args personalizados,
 * garantindo as flags de autonomia definidas pelo adapter sem apagar modelo,
 * effort ou outras opcoes salvas pelo usuario.
 */
export function materializeInteractiveAgentCommand(
  payload: Record<string, unknown>
): { payload: Record<string, unknown>; changed: boolean } {
  const provider = typeof payload.provider === 'string' ? payload.provider : null;
  if (!provider || !hasAgentAdapter(provider)) return { payload, changed: false };
  if (Array.isArray(payload.args) && payload.args.length > 0) return { payload, changed: false };

  const spec = getAgentAdapter(provider).interactiveCommand();
  const storedEnv = payload.env && typeof payload.env === 'object' && !Array.isArray(payload.env)
    ? payload.env as Record<string, string>
    : {};
  const env = { ...(spec.env ?? {}), ...storedEnv };
  const nextPayload: Record<string, unknown> = {
    ...payload,
    command: spec.command,
    args: [...spec.args],
    ...(Object.keys(env).length ? { env } : {}),
  };
  const currentArgs = Array.isArray(payload.args) ? payload.args : [];
  const commandChanged = payload.command !== spec.command;
  const argsChanged = JSON.stringify(currentArgs) !== JSON.stringify(spec.args);
  const envChanged = spec.env
    ? Object.entries(spec.env).some(([key, value]) => storedEnv[key] !== value)
    : false;

  return { payload: nextPayload, changed: commandChanged || argsChanged || envChanged };
}

registerAgentAdapter(claudeAdapter);
registerAgentAdapter(codexAdapter);
registerAgentAdapter(kimiAdapter);
registerAgentAdapter(openCodeAdapter);
registerAgentAdapter(cursorAdapter);
registerAgentAdapter(antigravityAdapter);
registerAgentAdapter(clineAdapter);
