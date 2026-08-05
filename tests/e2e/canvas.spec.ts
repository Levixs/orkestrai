import { expect, test } from '@playwright/test';
import { createNodeOnCanvas } from './helpers.js';

test.describe('canvas de workspaces', () => {
  test('cria workspace, adiciona nota e terminal, e persiste apos reload', async ({ page, request }) => {
    const workspaceName = `E2E ${Date.now()}`;

    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretorio de trabalho').fill('/tmp');
    await page.getByRole('button', { name: 'Criar' }).click();

    // Workspace ativo na sidebar
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();
    await expect(page.locator('.workspace-list li.active')).toContainText(workspaceName);

    // Adiciona uma nota e escreve nela
    await createNodeOnCanvas(page, 'Nota');
    const note = page.locator('.canvas-note');
    await expect(note).toBeVisible();
    await note.locator('textarea').fill('# tarefa e2e');

    // Adiciona um terminal shell
    await createNodeOnCanvas(page, 'Shell', { x: 700, y: 600 });
    await expect(page.locator('.canvas-terminal')).toBeVisible();
    await expect(page.locator('.canvas-terminal .xterm')).toBeVisible({ timeout: 10_000 });

    // Aguarda o debounce da nota (600ms) + persistencia
    await page.waitForTimeout(1_200);

    // Recarrega: nota e terminal voltam do banco com conteudo
    await page.reload();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();
    await expect(page.locator('.workspace-list li.active')).toContainText(workspaceName);
    await expect(page.locator('.canvas-note textarea')).toHaveValue('# tarefa e2e');
    await expect(page.locator('.canvas-terminal')).toBeVisible();

    // Limpeza: apaga o workspace pela API
    const list = await request.get('/api/agent-room/workspaces');
    const workspaces = (await list.json()).data as Array<{ id: string; name: string }>;
    const created = workspaces.find((workspace) => workspace.name === workspaceName);
    if (created) await request.delete(`/api/agent-room/workspaces/${created.id}`);
  });

  test('renderiza e persiste aresta entre dois nos', async ({ page, request }) => {
    const workspaceName = `E2E edges ${Date.now()}`;

    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretorio de trabalho').fill('/tmp');
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();
    await expect(page.locator('.workspace-list li.active')).toContainText(workspaceName);

    await createNodeOnCanvas(page, 'Nota');
    await createNodeOnCanvas(page, 'Nota', { x: 900, y: 300 });
    await expect(page.locator('.canvas-note')).toHaveCount(2);

    // Cria a conexao pela API (o drag entre handles e coberto pela biblioteca;
    // aqui validamos renderizacao + persistencia, que e a nossa parte).
    const list = await request.get('/api/agent-room/workspaces');
    const workspaces = (await list.json()).data as Array<{ id: string; name: string }>;
    const created = workspaces.find((workspace) => workspace.name === workspaceName)!;

    const nodesResponse = await request.get(`/api/agent-room/workspaces/${created.id}/nodes`);
    const canvasNodes = (await nodesResponse.json()).data as Array<{ id: string }>;
    await request.post(`/api/agent-room/workspaces/${created.id}/edges`, {
      data: { sourceNodeId: canvasNodes[0].id, targetNodeId: canvasNodes[1].id },
    });

    await page.reload();
    await expect(page.locator('.canvas-note')).toHaveCount(2);
    await expect(page.locator('.svelte-flow__edge')).toHaveCount(1);

    // Ao apagar um no, a aresta some junto
    await request.delete(`/api/agent-room/workspaces/${created.id}/nodes/${canvasNodes[0].id}`);
    await page.reload();
    await expect(page.locator('.svelte-flow__edge')).toHaveCount(0);

    await request.delete(`/api/agent-room/workspaces/${created.id}`);
  });

  test('conecta dois nos arrastando do handle (regressao: handles clicaveis)', async ({ page, request }) => {
    const workspaceName = `E2E drag ${Date.now()}`;

    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretorio de trabalho').fill('/tmp');
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();
    await expect(page.locator('.workspace-list li.active')).toContainText(workspaceName);

    await createNodeOnCanvas(page, 'Nota', { x: 450, y: 300 });
    await createNodeOnCanvas(page, 'Nota', { x: 850, y: 480 });
    await expect(page.locator('.canvas-note')).toHaveCount(2);

    // Arrasto real do handle do primeiro no ate o handle do segundo —
    // cobre hit-test do handle (overflow/z-index do shell).
    const sourceHandle = page.locator('.canvas-note').first().locator('.svelte-flow__handle').first();
    const targetHandle = page.locator('.canvas-note').nth(1).locator('.svelte-flow__handle').first();
    const sourceBox = await sourceHandle.boundingBox();
    const targetBox = await targetHandle.boundingBox();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('.svelte-flow__edge')).toHaveCount(1);

    // Persistiu no backend?
    const list = await request.get('/api/agent-room/workspaces');
    const workspaces = (await list.json()).data as Array<{ id: string; name: string }>;
    const created = workspaces.find((workspace) => workspace.name === workspaceName)!;
    const edgesResponse = await request.get(`/api/agent-room/workspaces/${created.id}/edges`);
    expect(((await edgesResponse.json()).data as unknown[]).length).toBe(1);

    // Clica num ponto livre do traco (fora do handle e do X) para fixar o X
    await expect(page.locator('.orkestrai-edge path.edge-line')).toHaveCount(1);
    await page.waitForTimeout(2500); // espera a corda assentar (fisica)
    const ropePoint = await page.evaluate(() => {
      const path = document.querySelector<SVGPathElement>('.orkestrai-edge path.edge-line')!;
      const ctm = path.getScreenCTM()!;
      for (const fraction of [0.3, 0.4, 0.5, 0.6, 0.7, 0.25, 0.75]) {
        const point = path.getPointAtLength(path.getTotalLength() * fraction);
        const x = ctm.a * point.x + ctm.c * point.y + ctm.e;
        const y = ctm.b * point.x + ctm.d * point.y + ctm.f;
        const top = document.elementFromPoint(x, y);
        if (top === path || (top instanceof SVGPathElement && top.getAttribute('stroke') === 'transparent')) {
          return { x, y };
        }
      }
      throw new Error('Nenhum ponto livre encontrado na corda');
    });
    await page.mouse.click(ropePoint.x, ropePoint.y);
    await expect(page.locator('.edge-delete.pinned')).toHaveCount(1);
    await page.locator('.edge-delete.pinned').click();
    await expect(page.locator('.svelte-flow__edge')).toHaveCount(0);

    await request.delete(`/api/agent-room/workspaces/${created.id}`);
  });

  test('renomeia um no com duplo-clique no titulo e persiste', async ({ page, request }) => {
    const workspaceName = `E2E rename ${Date.now()}`;

    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretorio de trabalho').fill('/tmp');
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();

    await createNodeOnCanvas(page, 'Nota');
    await expect(page.locator('.canvas-note')).toHaveCount(1);

    await page.locator('.canvas-note .node-title').dblclick();
    await page.locator('.node-title-input').fill('Backlog do time');
    await page.keyboard.press('Enter');
    await expect(page.locator('.canvas-note .node-title')).toHaveText('Backlog do time');

    const list = await request.get('/api/agent-room/workspaces');
    const workspace = ((await list.json()).data as Array<{ id: string; name: string }>).find((item) => item.name === workspaceName)!;
    const nodesResponse = await request.get(`/api/agent-room/workspaces/${workspace.id}/nodes`);
    const canvasNodes = (await nodesResponse.json()).data as Array<{ title: string }>;
    expect(canvasNodes[0].title).toBe('Backlog do time');

    await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
  });

  test('edita nome e instrucoes do workspace', async ({ page, request }) => {
    const workspaceName = `E2E edit ${Date.now()}`;

    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretorio de trabalho').fill('/tmp');
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();
    await expect(page.locator('.workspace-list li.active')).toContainText(workspaceName);

    await page.getByRole('button', { name: 'Editar workspace' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Nome').fill(`${workspaceName} renomeado`);
    await dialog.locator('textarea').fill('Sempre responda em pt-BR.');
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();

    await expect(page.locator('.workspace-list li.active')).toContainText('renomeado');

    // Instrucoes gravadas em AGENTS.md no diretorio de trabalho
    const list = await request.get('/api/agent-room/workspaces');
    const workspaces = (await list.json()).data as Array<{ id: string; name: string; instructions: string | null }>;
    const created = workspaces.find((workspace) => workspace.name.includes(workspaceName))!;
    expect(created.instructions).toBe('Sempre responda em pt-BR.');

    await request.delete(`/api/agent-room/workspaces/${created.id}`);
  });
});
