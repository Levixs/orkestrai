import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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

      await expect(page.getByRole('spinbutton', { name: 'W', exact: true })).not.toHaveValue('180');
      await expect(page.getByRole('spinbutton', { name: 'H', exact: true })).not.toHaveValue('120');
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

  test('combines vectors, draws paths, imports assets, exports, and caches its preview', async ({ page, request }) => {
    test.setTimeout(60_000);
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-design-phase2-e2e-'));
    const originalSettings = (await (await request.get('/api/agent-room/settings')).json()).data as Record<string, string>;
    const workspace = (await (await request.post('/api/agent-room/workspaces', {
      data: { name: `E2E design phase 2 ${Date.now()}`, workingDir: dir },
    })).json()).data as { id: string };
    const node = (await (await request.post(`/api/agent-room/workspaces/${workspace.id}/nodes`, {
      data: { type: 'design', title: 'Vector system', x: 120, y: 120, width: 720, height: 520, payload: {} },
    })).json()).data as { id: string };
    const initial = (await (await request.get(`/api/agent-room/workspaces/${workspace.id}/designs/${node.id}`)).json()).data as {
      revision: number;
      activePageId: string;
    };
    const firstId = randomUUID();
    const secondId = randomUUID();
    await request.patch(`/api/agent-room/workspaces/${workspace.id}/designs/${node.id}`, {
      data: {
        baseRevision: initial.revision,
        operations: [
          { kind: 'create', element: { id: firstId, pageId: initial.activePageId, parentId: null, type: 'rectangle', name: 'Rectangle A', x: 220, y: 220, width: 220, height: 160 } },
          { kind: 'create', element: { id: secondId, pageId: initial.activePageId, parentId: null, type: 'rectangle', name: 'Rectangle B', x: 340, y: 280, width: 220, height: 160 } },
        ],
        summary: 'Seed boolean layers',
        actor: { kind: 'user', id: null, name: null, taskId: null },
      },
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    try {
      await request.put('/api/agent-room/settings', { data: { ...originalSettings, uiLanguage: 'en' } });
      await page.goto(`/canvas?workspace=${workspace.id}&node=${node.id}&design=1`);
      const editor = page.locator('[data-testid="canvas-design-mode"]');
      await expect(editor).toBeVisible();

      await editor.getByRole('button', { name: 'Rectangle A', exact: true }).click();
      await editor.getByRole('button', { name: 'Rectangle B', exact: true }).click({ modifiers: ['Shift'] });
      await editor.getByRole('button', { name: 'Boolean operation', exact: true }).click();
      const combined = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes(`/designs/${node.id}`));
      await page.getByRole('menuitem', { name: 'Union', exact: true }).click();
      await combined;

      let current = (await (await request.get(`/api/agent-room/workspaces/${workspace.id}/designs/${node.id}`)).json()).data as {
        revision: number;
        elements: Array<{ type: string; pathSubpaths: unknown[][] }>;
        guides: unknown[];
        assets: unknown[];
      };
      expect(current.elements).toHaveLength(1);
      expect(current.elements[0].type).toBe('path');
      expect(current.elements[0].pathSubpaths[0].length).toBeGreaterThan(3);

      await editor.getByRole('button', { name: 'Pen', exact: true }).click();
      const pageSvg = editor.locator('svg[role="application"]');
      const bounds = await pageSvg.boundingBox();
      expect(bounds).not.toBeNull();
      await page.mouse.click(bounds!.x + bounds!.width * 0.58, bounds!.y + bounds!.height * 0.28);
      await page.waitForTimeout(80);
      await page.mouse.click(bounds!.x + bounds!.width * 0.78, bounds!.y + bounds!.height * 0.42);
      await page.waitForTimeout(80);
      await page.mouse.click(bounds!.x + bounds!.width * 0.64, bounds!.y + bounds!.height * 0.64);
      const pathCreated = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes(`/designs/${node.id}`));
      await page.keyboard.press('Enter');
      await pathCreated;

      await editor.getByRole('button', { name: 'Rulers and guides', exact: true }).click();
      const guideCreated = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes(`/designs/${node.id}`));
      await page.getByRole('menuitem', { name: 'Add vertical guide', exact: true }).click();
      await guideCreated;

      const assetImported = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/designs/${node.id}/assets`));
      const imageCreated = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes(`/designs/${node.id}`));
      await editor.locator('input[type="file"]').setInputFiles({
        name: 'pixel.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
      });
      await assetImported;
      await imageCreated;

      current = (await (await request.get(`/api/agent-room/workspaces/${workspace.id}/designs/${node.id}`)).json()).data;
      expect(current.elements.filter((element) => element.type === 'path')).toHaveLength(2);
      expect(current.elements.some((element) => element.type === 'image')).toBe(true);
      expect(current.guides).toHaveLength(1);
      expect(current.assets).toHaveLength(1);

      await editor.getByRole('button', { name: 'Export', exact: true }).click();
      const download = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: 'Export SVG', exact: true }).click();
      expect((await download).suggestedFilename()).toMatch(/\.svg$/);

      await expect.poll(async () => (await request.get(
        `/api/agent-room/workspaces/${workspace.id}/designs/${node.id}/thumbnail?revision=${current.revision}`,
      )).status(), { timeout: 10_000 }).toBe(200);
      expect(pageErrors).toEqual([]);
    } finally {
      if (!page.isClosed()) await page.goto('about:blank');
      await request.put('/api/agent-room/settings', { data: originalSettings });
      await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
