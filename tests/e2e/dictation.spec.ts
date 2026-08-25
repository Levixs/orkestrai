import { expect, test } from '@playwright/test';

test.describe('ditado por voz', () => {
  test('deixa os controles de posição visíveis e acessíveis pelo badge', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('orkestrai.dictation-placement'));
    await page.goto('/canvas');

    const orb = page.locator('.dictation-trigger');
    const placementBadge = page.locator('.placement-trigger');
    await expect(orb).toBeVisible();
    await expect(placementBadge).toBeVisible();
    await expect(placementBadge).toHaveAttribute('aria-label', /Posição fixada|Position pinned|Posición fijada/);

    await orb.hover();
    await expect(page.getByText(/clique para abrir os controles de posição|click for position controls|clic para abrir los controles de posición/).first()).toBeVisible();

    await placementBadge.click();
    await page.getByRole('menuitem', { name: /Desafixar posição|Unpin position|Desfijar posición/ }).click();
    await expect(placementBadge).toHaveAttribute('aria-label', /Posição livre|Free position|Posición libre/);

    await placementBadge.click();
    await page.getByRole('menuitem', { name: /Restaurar posição|Reset position|Restablecer posición/ }).click();
    await expect(placementBadge).toHaveAttribute('aria-label', /Posição fixada|Position pinned|Posición fijada/);
  });

  test('aceita uploads maiores que o antigo limite de 512 KB', async ({ request }) => {
    const response = await request.post('/api/agent-room/voice/transcribe', {
      multipart: {
        file: {
          name: 'long-dictation.wav',
          mimeType: 'audio/wav',
          buffer: Buffer.alloc(600 * 1024),
        },
      },
    });

    expect(response.status()).not.toBe(413);
    expect(await response.text()).not.toMatch(/content[- ]length|body_size_limit/i);
  });

  test('atalho do ditado e configuravel e persiste', async ({ page, request }) => {
    // Isolamento: garante o atalho padrao antes de abrir a pagina (uma corrida
    // anterior que morreu no meio do teste deixaria outro atalho salvo).
    await expect.poll(
      async () => request.put('/api/agent-room/settings', { data: { dictationHotkey: 'alt+space' } })
        .then((response) => response.ok())
        .catch(() => false),
      { timeout: 10_000, intervals: [250, 500, 1_000] },
    ).toBe(true);
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
    const shortcut = page.locator('.shortcut-row', { hasText: /Ditado por voz|Voice dictation|Dictado por voz/ }).locator('kbd');
    await expect(shortcut).toContainText(/Ctrl\s*\+\s*Shift\s*\+\s*D/);

    // Restaura o padrao para nao quebrar outros testes/uso.
    await page.getByRole('button', { name: /Restaurar padrão|Restaurar padrao/ }).click();
    await page.getByRole('button', { name: 'Salvar' }).first().click();
    await expect.poll(async () => {
      const response = await request.get('/api/agent-room/settings');
      return (await response.json()).data?.dictationHotkey;
    }).toBe('alt+space');
  });

  test('envio automatico do terminal e opt-in e persiste', async ({ page, request }) => {
    await request.put('/api/agent-room/settings', { data: { dictationAutoSubmit: 'false' } });
    await page.goto('/settings');

    const autoSubmit = page.getByRole('switch', { name: /Enviar automaticamente|Send automatically|Enviar automáticamente/ });
    await expect(autoSubmit).not.toBeChecked();
    await autoSubmit.click();
    await page.getByRole('button', { name: /Salvar|Save|Guardar/ }).first().click();

    await expect.poll(async () => {
      const response = await request.get('/api/agent-room/settings');
      return (await response.json()).data?.dictationAutoSubmit;
    }).toBe('true');

    await autoSubmit.click();
    await page.getByRole('button', { name: /Salvar|Save|Guardar/ }).first().click();
    await expect.poll(async () => {
      const response = await request.get('/api/agent-room/settings');
      return (await response.json()).data?.dictationAutoSubmit;
    }).toBe('false');
  });
});
