import { expect, test } from '@playwright/test';
import { selectAgentTool } from './helpers.js';

test.describe('terminais PTY', () => {
  test('navega pelos artefatos persistidos e preserva a selecao ao voltar ao canvas', async ({ page, request }) => {
    const workspaceName = `E2E modo terminais ${Date.now()}`;

    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretório de trabalho').fill('/tmp');
    await page.getByRole('button', { name: 'Criar' }).click();

    const list = await request.get('/api/agent-room/workspaces');
    const workspace = ((await list.json()).data as Array<{ id: string; name: string }>).find(
      (item) => item.name === workspaceName
    )!;

    try {
      const noteResponse = await request.post(`/api/agent-room/workspaces/${workspace.id}/nodes`, {
        data: {
          type: 'note',
          title: 'Briefing E2E',
          x: 100,
          y: 100,
          width: 360,
          height: 260,
          payload: { content: '# Briefing persistido' },
        },
      });
      const note = (await noteResponse.json()).data as { id: string };

      await request.post(`/api/agent-room/workspaces/${workspace.id}/nodes`, {
        data: {
          type: 'terminal',
          title: 'Shell E2E',
          x: 520,
          y: 100,
          width: 480,
          height: 320,
          payload: { command: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh', args: [] },
        },
      });
      const leaderResponse = await request.post(`/api/agent-room/workspaces/${workspace.id}/nodes`, {
        data: {
          type: 'terminal',
          title: 'Lider de voz E2E',
          x: 520,
          y: 460,
          width: 480,
          height: 320,
          payload: {
            command: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
            args: [],
            maestro: true,
          },
        },
      });
      const leader = (await leaderResponse.json()).data as { id: string };

      await page.goto(`/terminal?workspace=${workspace.id}&node=${note.id}`);
      const tree = page.getByTestId('terminal-workspace-tree');
      await expect(tree).toContainText(workspaceName);
      await expect(page.locator('.canvas-note textarea')).toHaveValue('# Briefing persistido');

      const search = page.getByTestId('terminal-workspace-search');
      await search.fill('Shell E2E');
      await expect(tree).toContainText('Shell E2E');
      await expect(tree).not.toContainText('Briefing E2E');
      await tree.locator('button', { hasText: 'Shell E2E' }).click();

      const terminal = page.locator('.canvas-terminal');
      await expect(terminal.locator('.xterm')).toBeVisible({ timeout: 15_000 });
      const marker = `e2e-${Date.now()}`;
      await terminal.locator('.terminal-container').click();
      await page.keyboard.type(`echo ${marker}`);
      await page.keyboard.press('Enter');
      await expect(terminal.locator('.terminal-container')).toContainText(marker, { timeout: 10_000 });

      const fallbackHandled = await page.evaluate(() => {
        const detail = { handled: false };
        window.dispatchEvent(new CustomEvent('orkestrai:text-dictation-fallback', { detail }));
        return detail.handled;
      });
      expect(fallbackHandled).toBe(true);
      await expect(page).toHaveURL(new RegExp(`/terminal\\?workspace=${workspace.id}.*node=${leader.id}`));
      await expect(page.getByTestId('terminal-workspace-header')).toContainText('Lider de voz E2E');

      await page.getByTestId('terminal-open-canvas').click();
      await expect(page).toHaveURL(new RegExp(`/canvas\\?workspace=${workspace.id}.*node=`));
      await expect(page.locator('.canvas-terminal.selected')).toContainText('Lider de voz E2E');
    } finally {
      await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
    }
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
    await selectAgentTool(page, 'Claude');
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
