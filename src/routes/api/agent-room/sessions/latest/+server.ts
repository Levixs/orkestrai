import { json, type RequestHandler } from '@sveltejs/kit';
import { agentSessionTracker } from '$lib/modules/agent-room/infrastructure/pty/AgentSessionTracker.ts';

/**
 * Session-id mais recente de um provider num diretorio (para resume exato
 * quando o terminal nao capturou o id na criacao — ex.: watch expirou antes
 * da primeira mensagem, que e quando a CLI grava o arquivo de sessao).
 */
export const GET: RequestHandler = async ({ url }) => {
  const provider = url.searchParams.get('provider') ?? '';
  const cwd = url.searchParams.get('cwd') ?? '';
  if (!provider || !cwd) return json({ error: 'Informe provider e cwd.' }, { status: 422 });
  const agentSessionId = agentSessionTracker.findAgentSessionId(provider, cwd, 0);
  return json({ data: { agentSessionId } });
};
