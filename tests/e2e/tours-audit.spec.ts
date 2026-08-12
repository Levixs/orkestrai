import { expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOURS_PT } from '../../src/lib/components/agent-room/tours/catalog/pt-BR';

/**
 * Auditoria dos tours: UM teste por tour — cada "Fazer por mim" precisa
 * funcionar, nenhum passo pode travar e todo tour precisa concluir.
 * Um workspace por teste + unload ao final (mata as sessoes PTY dos agentes
 * criados — sem isso elas se acumulam e derrubam o browser).
 */
for (const tour of TOURS_PT) {
  test(`tour ${tour.id} completa sem travar`, async ({ page, request }) => {
    test.setTimeout(300_000);

    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-tour-'));
    execSync('git init -q && git config user.email tour@test.dev && git config user.name tour && touch README.md && git add -A && git commit -qm init', { cwd: dir });

    const workspaceName = `E2E tour-${tour.id} ${Date.now()}`;
    const created = await request.post('/api/agent-room/workspaces', { data: { name: workspaceName, workingDir: dir } });
    const workspace = (await created.json()).data as { id: string };

    try {
      await page.goto('/canvas');
      await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();
      await expect(page.locator('.svelte-flow__pane')).toBeVisible();

      await page.goto('/canvas?onboarding=1');
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.getByRole('button', { name: 'Português (Brasil)' }).click();
      await dialog.getByRole('button', { name: 'Já tenho workspace — pular' }).click();
      await dialog.locator('.tour-card', { hasText: tour.title }).first().click();
      await dialog.getByRole('button', { name: 'Começar o tour guiado' }).click();
      const panel = page.locator('.tour-panel');
      await expect(panel).toBeVisible({ timeout: 10_000 });

      for (let guard = 0; guard < 30; guard += 1) {
        if (await panel.getByText('Tour concluído!').isVisible().catch(() => false)) break;
        const errorText = await panel.locator('.tour-error').textContent({ timeout: 300 }).catch(() => null);
        expect(errorText, `erro na acao do passo: ${errorText}`).toBeFalsy();
        const titleBefore = (await panel.locator('.tour-title').textContent().catch(() => null)) ?? '';
        const doForMe = panel.getByRole('button', { name: /Fazer por mim/ });
        const doneStep = panel.getByRole('button', { name: /Concluir passo/ });
        const next = panel.getByRole('button', { name: /Próximo passo/ });
        if (await doForMe.count()) await doForMe.click();
        else if (await doneStep.count()) await doneStep.click();
        else if (await next.count()) await next.click();
        // Espera o passo AVANCAR (titulo muda) ou o tour concluir — passos com
        // check avancam no poll de 3s; CLIs reais spawnando deixam tudo lento.
        await expect
          .poll(
            async () =>
              (await panel.getByText('Tour concluído!').isVisible().catch(() => false)) ||
              ((await panel.locator('.tour-title').textContent().catch(() => null)) ?? '') !== titleBefore,
            { timeout: 45_000, intervals: [500, 1000, 2000] }
          )
          .toBe(true);
      }
      await expect(panel.getByText('Tour concluído!')).toBeVisible({ timeout: 15_000 });
    } finally {
      await request.post(`/api/agent-room/workspaces/${workspace.id}/unload`).catch(() => {});
      await request.delete(`/api/agent-room/workspaces/${workspace.id}`).catch(() => {});
    }
  });
}
