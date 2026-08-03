import type { AgentModelOption } from '../domain/types.js';
import { listAgentAdapters } from './adapters/registry.js';

/**
 * Lista modelos por provider iterando o registry de adapters.
 * Cada adapter resolve seus modelos (CLI ou fallback estatico).
 */
export async function listAgentModelOptions(): Promise<Record<string, AgentModelOption[]>> {
  const entries = await Promise.all(
    listAgentAdapters().map(async (adapter) => [adapter.id, await adapter.listModels()] as const)
  );
  return Object.fromEntries(entries);
}
