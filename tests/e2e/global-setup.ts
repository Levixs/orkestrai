import { request, type FullConfig } from '@playwright/test';

export default async function globalSetup(config: FullConfig) {
  const baseURL = String(config.projects[0]?.use.baseURL ?? 'http://127.0.0.1:5199');
  const api = await request.newContext({ baseURL });
  const response = await api.get('/api/agent-room/settings');
  if (!response.ok()) throw new Error(`Unable to read E2E settings: HTTP ${response.status()}`);
  const original = (await response.json()).data as Record<string, unknown>;
  const update = await api.put('/api/agent-room/settings', {
    data: { ...original, uiLanguage: 'pt-BR' },
  });
  if (!update.ok()) throw new Error(`Unable to set the E2E locale: HTTP ${update.status()}`);
  await api.dispose();

  return async () => {
    const cleanup = await request.newContext({ baseURL });
    await cleanup.put('/api/agent-room/settings', { data: original });
    await cleanup.dispose();
  };
}
