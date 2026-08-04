import { expect, test } from '@playwright/test';

test.describe('ditado por voz', () => {
  test('atalho do ditado e configuravel e persiste', async ({ page, request }) => {
    // Isolamento: garante o atalho padrao antes de abrir a pagina (uma corrida
    // anterior que morreu no meio do teste deixaria outro atalho salvo).
    await request.put('/api/agent-room/settings', { data: { dictationHotkey: 'alt+space' } });
    await page.goto('/settings');

    const capture = page.getByRole('button', { name: /Alt\+Espaco|Pressione as teclas/ });
    await expect(capture).toBeVisible();

    // Entra em modo de captura e pressiona a nova combinacao.
    await capture.click();
    await expect(page.getByRole('button', { name: /Pressione as teclas/ })).toBeVisible();
    await page.keyboard.press('Control+Shift+KeyD');
    await expect(page.getByRole('button', { name: 'Ctrl+Shift+D' })).toBeVisible();

    // Salva e confirma persistencia via API.
    await page.getByRole('button', { name: 'Salvar' }).first().click();
    await expect.poll(async () => {
      const response = await request.get('/api/agent-room/settings');
      return (await response.json()).data?.dictationHotkey;
    }).toBe('ctrl+shift+keyd');

    // A lista de atalhos reflete a nova combinacao.
    await expect(page.locator('.shortcuts-grid')).toContainText('Ctrl+Shift+D');

    // Restaura o padrao para nao quebrar outros testes/uso.
    await page.getByRole('button', { name: 'Restaurar padrao' }).click();
    await page.getByRole('button', { name: 'Salvar' }).first().click();
    await expect.poll(async () => {
      const response = await request.get('/api/agent-room/settings');
      return (await response.json()).data?.dictationHotkey;
    }).toBe('alt+space');
  });
});
