import { json, type RequestHandler } from '@sveltejs/kit';
import { agentRoomRepository } from '$lib/modules/agent-room/infrastructure/repositories/AgentRoomRepository.js';

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const title = String(body.title ?? '').trim();
    const conversation = await agentRoomRepository.renameConversation(params.id!, title);

    if (!conversation) {
      return json({ error: 'Conversa nao encontrada.' }, { status: 404 });
    }

    return json({ data: conversation });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao renomear conversa.' }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  const deleted = await agentRoomRepository.deleteConversation(params.id!);

  if (!deleted) {
    return json({ error: 'Conversa nao encontrada.' }, { status: 404 });
  }

  return json({ data: { deleted: true } });
};
