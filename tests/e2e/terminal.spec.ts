import { expect, test } from '@playwright/test';

test.describe('terminais PTY', () => {
  test('abre um shell, executa comando e mostra a saida', async ({ page }) => {
    await page.goto('/terminal');

    // Os botoes de provider so aparecem apos onMount (hidratar + fetch do status).
    await expect(page.getByRole('button', { name: 'Claude' })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Shell' }).click();
    const terminal = page.locator('.terminal-card').first();
    await expect(terminal).toBeVisible();

    // Aguarda o shell inicializar e digita um comando marcador.
    const marker = `e2e-${Date.now()}`;
    await terminal.locator('.terminal-container').click();
    await page.keyboard.type(`echo ${marker}`);
    await page.keyboard.press('Enter');

    await expect(terminal.locator('.terminal-container')).toContainText(marker, { timeout: 10_000 });
  });

  test('lista providers instalados com botoes de agente', async ({ page }) => {
    await page.goto('/terminal');
    await expect(page.getByRole('button', { name: 'Claude' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Codex' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Kimi' })).toBeVisible({ timeout: 15_000 });
  });

  test('botao de agente no canvas cria terminal com o comando do agente (nao shell puro)', async ({ page, request }) => {
    const workspaceName = `E2E agente ${Date.now()}`;

    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretório de trabalho').fill('/tmp');
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();
    await expect(page.locator('.workspace-list li.active')).toContainText(workspaceName);

    // Arma a ferramenta do agente e clica no canvas (tamanho padrao); o
    // dialogo de criacao abre — confirma com o nome padrao.
    const claudeButton = page.getByRole('button', { name: 'Claude', exact: true });
    await expect(claudeButton).toBeEnabled({ timeout: 15_000 });
    await claudeButton.click();
    await page.locator('.svelte-flow__pane').click({ position: { x: 700, y: 400 } });
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Criar agente' }).click();
    await expect(page.locator('.canvas-terminal')).toHaveCount(1);

    // O no precisa carregar o comando do agente, nao o shell do sistema.
    const list = await request.get('/api/agent-room/workspaces');
    const workspaces = (await list.json()).data as Array<{ id: string; name: string }>;
    const created = workspaces.find((workspace) => workspace.name === workspaceName)!;
    const nodesResponse = await request.get(`/api/agent-room/workspaces/${created.id}/nodes`);
    const canvasNodes = (await nodesResponse.json()).data as Array<{ title: string; payload: { command?: string; provider?: string } }>;
    expect(canvasNodes[0].title).toBe('Claude');
    expect(canvasNodes[0].payload.command).toBe('claude');
    expect(canvasNodes[0].payload.provider).toBe('claude');

    await request.delete(`/api/agent-room/workspaces/${created.id}`);
  });
});
