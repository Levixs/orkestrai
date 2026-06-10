import { json, type RequestHandler } from '@sveltejs/kit';
import { createProject, listProjects } from '$lib/modules/agent-room/application/projects.js';

export const GET: RequestHandler = async () => {
  return json({ data: listProjects() });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const project = createProject(String(body.name ?? 'novo-projeto'));
    return json({ data: project }, { status: 201 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao criar projeto.' }, { status: 400 });
  }
};
