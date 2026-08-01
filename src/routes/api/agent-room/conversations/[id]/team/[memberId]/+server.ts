import { json, type RequestHandler } from '@sveltejs/kit';
import type { UpdateTeamMemberPayload } from '$lib/modules/agent-room/domain/types.js';
import { deleteTeamMember, updateTeamMember } from '$lib/modules/agent-room/application/orchestrator.js';

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as UpdateTeamMemberPayload;
    const member = await updateTeamMember(params.memberId!, {
      title: body.title,
      provider: body.provider,
      role: body.role,
      model: body.model,
      effort: body.effort,
      canWrite: body.canWrite,
      participatesInLoop: body.participatesInLoop,
      capabilities: body.capabilities,
      systemPrompt: body.systemPrompt,
    });

    return json({ data: member });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao atualizar membro.' }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    return json({ data: await deleteTeamMember(params.memberId!) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao remover membro.' }, { status: 400 });
  }
};
