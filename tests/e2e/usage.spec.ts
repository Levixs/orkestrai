import { expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.describe('usage dos providers', () => {
  test('endpoint retorna os 3 providers com janelas ou erro amigavel', async ({ request }) => {
    const response = await request.get('/api/agent-room/usage');
    expect(response.ok()).toBe(true);
    const usages = (await response.json()).data as Array<{ provider: string; windows: unknown[]; error: string | null }>;
    expect(usages.map((usage) => usage.provider).sort()).toEqual(['claude', 'codex', 'kimi']);
    for (const usage of usages) {
      // Ou tem janelas de uso ou um erro amigavel (ambiente sem login da CLI).
      expect(usage.windows.length > 0 || Boolean(usage.error)).toBe(true);
    }
  });

  test('painel de usage abre no canvas e mostra cards', async ({ page, request }) => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-e2e-usage-'));
    const created = await request.post('/api/agent-room/workspaces', {
      data: { name: `E2E usage ${Date.now()}`, workingDir: dir },
    });
    const workspace = (await created.json()).data as { id: string };

    try {
      await page.goto('/canvas');
      await page.locator('.workspace-list .workspace-item', { hasText: 'E2E usage' }).click();
      await page.getByRole('button', { name: /Usage/ }).click();

      await expect(page.locator('.usage-panel h3')).toHaveText('Uso dos providers');
      await expect(page.locator('.usage-card')).toHaveCount(3, { timeout: 15_000 });
      // Cada card mostra janelas com barra ou mensagem de erro amigavel.
      const cards = page.locator('.usage-card');
      for (const card of await cards.all()) {
        await expect(card.locator('.window-row, .usage-error, .hint').first()).toBeVisible();
      }
    } finally {
      await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
    }
  });
});
