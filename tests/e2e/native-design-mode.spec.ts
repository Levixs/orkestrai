import { expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.describe('Native Design Mode', () => {
  test('draws freely and keeps layer deletion isolated from Canvas', async ({ page, request }) => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-design-e2e-'));
    const originalSettings = (await (await request.get('/api/agent-room/settings')).json()).data as Record<string, string>;
    const workspaceResponse = await request.post('/api/agent-room/workspaces', {
      data: { name: `E2E native design ${Date.now()}`, workingDir: dir },
    });
    const workspace = (await workspaceResponse.json()).data as { id: string };
    const nodeResponse = await request.post(`/api/agent-room/workspaces/${workspace.id}/nodes`, {
      data: { type: 'design', title: 'Interface draft', x: 120, y: 120, width: 720, height: 520, payload: {} },
    });
    const node = (await nodeResponse.json()).data as { id: string };
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
      await request.put('/api/agent-room/settings', { data: { ...originalSettings, uiLanguage: 'en' } });
      await page.goto(`/canvas?workspace=${workspace.id}&node=${node.id}&design=1`);
      await expect(page.locator('[data-testid="canvas-design-mode"]')).toBeVisible();
      await page.getByRole('button', { name: 'Rectangle', exact: true }).click();

      const pageSvg = page.locator('svg[role="application"]');
      const bounds = await pageSvg.boundingBox();
      expect(bounds).not.toBeNull();
      const start = { x: bounds!.x + bounds!.width * 0.55, y: bounds!.y + bounds!.height * 0.55 };
      const end = { x: start.x + 135, y: start.y + 72 };
      const created = page.waitForResponse((response) => (
        response.request().method() === 'PATCH' && response.url().includes(`/designs/${node.id}`)
      ));
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 12 });
      await page.mouse.up();
      await created;

      await expect(page.getByRole('spinbutton', { name: 'W' })).not.toHaveValue('180');
      await expect(page.getByRole('spinbutton', { name: 'H' })).not.toHaveValue('120');
      const afterCreate = (await (await request.get(
        `/api/agent-room/workspaces/${workspace.id}/designs/${node.id}`,
      )).json()).data as { elements: unknown[] };
      expect(afterCreate.elements).toHaveLength(1);

      const deleted = page.waitForResponse((response) => (
        response.request().method() === 'PATCH' && response.url().includes(`/designs/${node.id}`)
      ));
      await page.keyboard.press('Delete');
      await deleted;

      await expect(page.locator('[data-testid="canvas-design-mode"]')).toBeVisible();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      const afterDelete = (await (await request.get(
        `/api/agent-room/workspaces/${workspace.id}/designs/${node.id}`,
      )).json()).data as { elements: unknown[] };
      expect(afterDelete.elements).toHaveLength(0);
      expect(pageErrors).toEqual([]);
    } finally {
      await page.goto('about:blank');
      await request.put('/api/agent-room/settings', { data: originalSettings });
      await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
