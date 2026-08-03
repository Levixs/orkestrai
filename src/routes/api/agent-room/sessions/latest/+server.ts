import { json, type RequestHandler } from '@sveltejs/kit';
import { agentSessionTracker } from '$lib/modules/agent-room/infrastructure/pty/AgentSessionTracker.ts';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

/**
 * Session-id mais recente de um provider num diretorio que NENHUM outro
 * terminal do workspace reivindicou (para resume exato quando o terminal nao
 * capturou o id na criacao — ex.: watch expirou antes da primeira mensagem,
 * que e quando a CLI grava o arquivo de sessao). Sem isso, N agentes no mesmo
 * diretorio recebiam todos o id da sessao mais recente.
 */
export const GET: RequestHandler = async ({ url }) => {
  const provider = url.searchParams.get('provider') ?? '';
  const cwd = url.searchParams.get('cwd') ?? '';
  const workspaceId = url.searchParams.get('workspaceId') ?? '';
  if (!provider || !cwd) return json({ error: 'Informe provider e cwd.' }, { status: 422 });

  // Ids ja atribuidos a outros nos do workspace nao podem ser reusados.
  const exclude = new Set<string>();
  if (workspaceId) {
    const nodes = await workspaceRepository.listNodes(workspaceId);
    for (const node of nodes) {
      const payload = (node.payload ?? {}) as { agentSessionId?: string };
      if (payload.agentSessionId) exclude.add(payload.agentSessionId);
    }
  }

  const agentSessionId = agentSessionTracker.findLatestUnclaimedSessionId(provider, cwd, exclude);
  if (agentSessionId) agentSessionTracker.claim(agentSessionId);
  return json({ data: { agentSessionId } });
};
