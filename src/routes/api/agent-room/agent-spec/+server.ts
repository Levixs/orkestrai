import { json, type RequestHandler } from '@sveltejs/kit';
import { agentSpecSchema } from '$lib/modules/agent-room/contracts/schemas/schemas.js';
import { getAgentAdapter } from '$lib/modules/agent-room/application/adapters/registry.js';

/**
 * Monta o comando TUI interativo de um agente com model/effort escolhidos —
 * usado pelo dialogo de criacao de terminal do canvas.
 */
export const GET: RequestHandler = async ({ url }) => {
  const parsed = agentSpecSchema.safeParse({
    provider: url.searchParams.get('provider'),
    model: url.searchParams.get('model') || null,
    effort: url.searchParams.get('effort') || null,
  });
  if (!parsed.success) {
    return json({ error: 'Parametros invalidos (provider/model/effort).' }, { status: 422 });
  }
  try {
    const spec = getAgentAdapter(parsed.data.provider).interactiveCommand({
      model: parsed.data.model ?? undefined,
      effort: parsed.data.effort ?? undefined,
    });
    return json({ data: spec });
  } catch {
    return json({ error: 'Provider desconhecido.' }, { status: 404 });
  }
};
