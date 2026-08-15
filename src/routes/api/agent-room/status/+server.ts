import { json, type RequestHandler } from '@sveltejs/kit';
import type { AgentProviderInfo } from '$lib/modules/agent-room/domain/types.js';
import { listAgentAdapters } from '$lib/modules/agent-room/application/adapters/registry.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { withWorkspaceExecutionRuntime, workspaceExecutionRuntime } from '$lib/modules/agent-room/infrastructure/WslRuntime.js';

export const GET: RequestHandler = async ({ url }) => {
  const workspaceId = url.searchParams.get('workspaceId');
  const workspace = workspaceId ? await workspaceRepository.getWorkspace(workspaceId) : null;
  const runtime = workspace ? workspaceExecutionRuntime(workspace) : { kind: 'native' as const };
  const providers: AgentProviderInfo[] = await Promise.all(
    listAgentAdapters().map(async (adapter) => {
      const detection = await withWorkspaceExecutionRuntime(runtime, () => adapter.detect());
      const tui = adapter.interactiveCommand();
      const models = await withWorkspaceExecutionRuntime(runtime, () => adapter.listModels()).catch(() => []);
      return {
        id: adapter.id,
        displayName: adapter.displayName,
        supportsResume: adapter.supportsResume,
        efforts: adapter.efforts,
        sessionStorage: adapter.sessionStorage,
        setup: adapter.setup,
        installed: detection.installed,
        detail: detection.detail,
        tui: {
          command: tui.command,
          args: tui.args,
          env: tui.env,
          resumeArgs: adapter.resumeArgs(),
          exactResumeArgs: adapter.resumeArgs('__ORKESTRAI_SESSION_ID__'),
          freshSessionArgs: adapter.freshSessionArgs?.('__ORKESTRAI_SESSION_ID__') ?? null,
        },
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
