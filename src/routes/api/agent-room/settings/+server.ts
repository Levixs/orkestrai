import { json, type RequestHandler } from '@sveltejs/kit';
import { settingsService } from '$lib/modules/agent-room/application/services/SettingsService.js';

export const GET: RequestHandler = async () => {
  return json({ data: await settingsService.all() });
};

export const PUT: RequestHandler = async ({ request }) => {
  const body = await request.json();
  for (const [key, value] of Object.entries(body)) {
    await settingsService.set(key, String(value));
  }
  return json({ data: await settingsService.all() });
};
