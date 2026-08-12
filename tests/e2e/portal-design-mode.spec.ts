import { expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.describe('Portal Design Mode', () => {
  test('keeps browser fallback explicit instead of silently exposing a broken inspector', async ({ page, request }) => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-portal-design-e2e-'));
    const originalSettings = (await (await request.get('/api/agent-room/settings')).json()).data as Record<string, string>;
    const workspaceResponse = await request.post('/api/agent-room/workspaces', {
      data: { name: `E2E Portal Design ${Date.now()}`, workingDir: dir },
    });
    const workspace = (await workspaceResponse.json()).data as { id: string };
    const portalResponse = await request.post(`/api/agent-room/workspaces/${workspace.id}/nodes`, {
      data: {
        type: 'portal', title: 'Design preview', x: 120, y: 120, width: 720, height: 520,
        payload: { url: 'http://127.0.0.1:5199/docs' },
      },
    });
    const portal = (await portalResponse.json()).data as { id: string };

    try {
      await request.put('/api/agent-room/settings', {
        data: { ...originalSettings, uiLanguage: 'en' },
      });
      await page.goto(`/canvas?workspace=${workspace.id}&node=${portal.id}`);
      const portalNode = page.locator('.canvas-portal');
      await expect(portalNode).toBeVisible();
      await portalNode.getByRole('button', { name: 'Design inspection is available in the installed desktop app.' }).click();
      await expect(page.getByText('Design inspection is available in the installed desktop app.')).toBeVisible();
    } finally {
      await page.goto('about:blank');
      await request.put('/api/agent-room/settings', { data: originalSettings });
      await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
