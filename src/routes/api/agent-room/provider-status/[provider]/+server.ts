import { json, type RequestHandler } from '@sveltejs/kit';
import { providerStatusService } from '$lib/modules/agent-room/application/services/ProviderStatusService.js';

export const GET: RequestHandler = async ({ params }) => {
  const data = await providerStatusService.getStatus(params.provider ?? '');
  return json({ data });
};
