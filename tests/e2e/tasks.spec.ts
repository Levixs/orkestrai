import { expect, test } from '@playwright/test';
import { createNodeOnCanvas } from './helpers';

test.describe('quadro de tarefas (kanban)', () => {
  test('cria, arrasta entre colunas, edita e remove tarefas', async ({ page, request }) => {
    const workspaceName = `E2E kanban ${Date.now()}`;

    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretorio de trabalho').fill('/tmp');
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();

    await createNodeOnCanvas(page, 'Tarefas');
    await expect(page.locator('.canvas-tasks')).toHaveCount(1);

    // Adiciona duas tarefas pelo input do quadro
    const board = page.locator('.canvas-tasks');
    const input = board.locator('.tb-add input');
    await input.fill('Revisar PR do auth');
    await input.press('Enter');
    await input.fill('Escrever testes do parser');
    await input.press('Enter');
    await expect(board.locator('.tb-card')).toHaveCount(2);
    await expect(board.locator('.tb-column').first()).toContainText('A fazer');

    // Arrasta a primeira tarefa para "Fazendo" (drag and drop)
    const firstCard = board.locator('.tb-card').first();
    const doingColumn = board.locator('.tb-column').nth(1);
    await firstCard.dragTo(doingColumn);
    await expect(doingColumn.locator('.tb-card')).toHaveCount(1);

    // Edita o titulo com duplo-clique
    await board.locator('.tb-card .tb-title').first().dblclick();
    await board.locator('.tb-edit').fill('Revisar PR do auth (urgente)');
    await page.keyboard.press('Enter');
    await expect(board.locator('.tb-card .tb-title').first()).toHaveText('Revisar PR do auth (urgente)');

    // Persistiu no backend?
    const list = await request.get('/api/agent-room/workspaces');
    const workspace = ((await list.json()).data as Array<{ id: string; name: string }>).find((item) => item.name === workspaceName)!;
    const tasksResponse = await request.get(`/api/agent-room/workspaces/${workspace.id}/tasks`);
    const tasks = (await tasksResponse.json()).data as Array<{ title: string; status: string }>;
    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.status).sort()).toEqual(['doing', 'todo']);

    // Remove uma tarefa (icone de lixeira no cartao)
    await board.locator('.tb-card').first().locator('.tb-icon-btn').first().click();
    await expect(board.locator('.tb-card')).toHaveCount(1);

    await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
  });
});
