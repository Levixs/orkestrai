import { expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.describe('marketplace de skills', () => {
  test('busca no skills.sh, instala no workspace e remove', async ({ page, request }) => {
    // Dependencias externas (skills.sh + registry MCP no mount da pagina).
    test.setTimeout(120_000);
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-e2e-skills-'));
    const created = await request.post('/api/agent-room/workspaces', {
      data: { name: `E2E skills ${Date.now()}`, workingDir: dir },
    });
    const workspace = (await created.json()).data as { id: string };

    try {
      await page.goto(`/skills?workspace=${workspace.id}`);
      await expect(page.getByRole('heading', { name: 'Skills & MCPs' })).toBeVisible();
      // A skill da ponte nasce instalada com o workspace.
      await expect(page.locator('.item-row', { hasText: 'orkestrai-bridge' })).toBeVisible();

      // Busca real no registry (endpoint publico do skills.sh).
      await page.locator('.search-input').fill('web design guidelines');
      await page.getByRole('button', { name: 'Buscar' }).click();
      const firstResult = page.locator('.result-row').first();
      await expect(firstResult).toBeVisible({ timeout: 20_000 });

      // Instala a primeira skill encontrada e confere a lista de instaladas.
      await firstResult.getByRole('button', { name: 'Instalar' }).click();
      const installedSkill = page.locator('.installed-row', { hasText: 'web-design-guidelines' });
      await expect(installedSkill).toBeVisible({ timeout: 20_000 });
      await expect(firstResult.getByText('Instalada')).toBeVisible();

      // Remove pelo botao da lista de instaladas (resta so a da ponte).
      await installedSkill.getByRole('button').click();
      await expect(page.locator('.installed-row')).toHaveCount(1);
      await expect(page.locator('.item-row', { hasText: 'orkestrai-bridge' })).toBeVisible();
    } finally {
      await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
    }
  });
});
