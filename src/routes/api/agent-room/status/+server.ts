import { json, type RequestHandler } from '@sveltejs/kit';
import type { AgentProviderInfo } from '$lib/modules/agent-room/domain/types.js';
import { listAgentAdapters } from '$lib/modules/agent-room/application/adapters/registry.js';

export const GET: RequestHandler = async () => {
  const providers: AgentProviderInfo[] = await Promise.all(
    listAgentAdapters().map(async (adapter) => {
      const detection = await adapter.detect();
      const tui = adapter.interactiveCommand();
      const models = await adapter.listModels().catch(() => []);
      return {
        id: adapter.id,
        displayName: adapter.displayName,
        supportsResume: adapter.supportsResume,
        installed: detection.installed,
        detail: detection.detail,
        tui: { command: tui.command, args: tui.args, resumeArgs: adapter.resumeArgs() },
        models,
      };
    })
  );

  // Mantem as chaves por id (codex/claude) para compatibilidade e expoe
  // a lista `providers` para UIs dinamicas.
  const byId = Object.fromEntries(providers.map((provider) => [provider.id, { installed: provider.installed, detail: provider.detail }]));

  return json({
    data: {
      ...byId,
      providers,
    },
  });
};
