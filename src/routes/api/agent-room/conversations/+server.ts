import { json, type RequestHandler } from '@sveltejs/kit';
import type { ConversationMode } from '$lib/modules/agent-room/domain/types.js';
import { agentRoomRepository } from '$lib/modules/agent-room/infrastructure/repositories/AgentRoomRepository.js';
import { resolveSafeProjectPath } from '$lib/modules/agent-room/infrastructure/workspace.js';

export const GET: RequestHandler = async () => {
  return json({ data: await agentRoomRepository.listConversations() });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const projectPath = body.projectPath ? resolveSafeProjectPath(String(body.projectPath)) : null;
    const conversation = await agentRoomRepository.createConversation({
      title: String(body.title ?? 'Nova conversa'),
      mode: (body.mode ?? 'chat') as ConversationMode,
      projectPath,
    });

    return json({ data: conversation }, { status: 201 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao criar conversa.' }, { status: 400 });
  }
};
