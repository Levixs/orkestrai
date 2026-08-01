import { json, type RequestHandler } from '@sveltejs/kit';
import { agentRoomRepository } from '$lib/modules/agent-room/infrastructure/repositories/AgentRoomRepository.js';

export const GET: RequestHandler = async ({ params }) => {
  const conversation = await agentRoomRepository.getConversation(params.id!);
  if (!conversation) {
    return json({ error: 'Conversa nao encontrada.' }, { status: 404 });
  }

  return json({ data: await agentRoomRepository.listMessages(params.id!) });
};

export const POST: RequestHandler = async ({ params, request }) => {
  const conversation = await agentRoomRepository.getConversation(params.id!);
  if (!conversation) {
    return json({ error: 'Conversa nao encontrada.' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const content = String(body.content ?? '').trim();
  if (!content) {
    return json({ error: 'A mensagem nao pode ficar vazia.' }, { status: 400 });
  }

  const message = await agentRoomRepository.addMessage({
    conversationId: params.id!,
    participant: 'user',
    content,
  });

  return json({ data: message }, { status: 201 });
};
