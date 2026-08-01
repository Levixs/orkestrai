import { json, type RequestHandler } from '@sveltejs/kit';
import { listAgentModelOptions } from '$lib/modules/agent-room/application/model-options.js';

export const GET: RequestHandler = async () => {
  return json({ data: await listAgentModelOptions() });
};
