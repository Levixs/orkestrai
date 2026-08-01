import { json, type RequestHandler } from '@sveltejs/kit';
import type { CreateTeamMemberPayload } from '$lib/modules/agent-room/domain/types.js';
import { createTeamMember, listTeamMembers } from '$lib/modules/agent-room/application/orchestrator.js';

export const GET: RequestHandler = async ({ params }) => {
  try {
    return json({ data: await listTeamMembers(params.id!) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao carregar time.' }, { status: 400 });
  }
};

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<CreateTeamMemberPayload>;
    const member = await createTeamMember(params.id!, {
      title: String(body.title ?? ''),
      provider: body.provider ?? 'codex',
      role: body.role ?? 'custom',
      model: body.model ?? null,
      effort: body.effort ?? 'medium',
      canWrite: Boolean(body.canWrite),
      participatesInLoop: body.participatesInLoop ?? true,
      capabilities: body.capabilities ?? [],
      systemPrompt: body.systemPrompt ?? '',
    });

    return json({ data: member }, { status: 201 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao criar membro.' }, { status: 400 });
  }
};
