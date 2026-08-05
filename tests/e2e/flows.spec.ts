import { expect, test } from '@playwright/test';
import { createNodeOnCanvas } from './helpers';

test.describe('nó de fluxo (pipeline)', () => {
  test('monta passos, roda com aprovação e registra histórico', async ({ page, request }) => {
    const workspaceName = `E2E fluxo ${Date.now()}`;

    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretório de trabalho').fill('/tmp');
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();

    await createNodeOnCanvas(page, 'Fluxo');
    const flow = page.locator('.canvas-flow');
    await expect(flow).toHaveCount(1);

    // Sem agentes no canvas: "+ Agente" explica o que falta (nada de falha silenciosa)
    await flow.getByRole('button', { name: 'Agente' }).click();
    await expect(flow.locator('.flow-banner')).toContainText('Crie um agente');

    // Rodar sem passos: orienta em vez de ignorar o clique
    await flow.getByRole('button', { name: 'Rodar' }).click();
    await expect(flow.locator('.flow-banner')).toContainText('passo');

    // Monta um passo de aprovação, roda, aprova e vê o histórico
    await flow.getByRole('button', { name: 'Aprovacao' }).click();
    await expect(flow.locator('.flow-step')).toHaveCount(1);
    await flow.getByRole('button', { name: 'Rodar' }).click();
    const approveButton = flow.getByRole('button', { name: 'Aprovar e continuar' });
    await expect(approveButton).toBeVisible({ timeout: 10_000 });
    await approveButton.click();
    await expect(flow.locator('.flow-history-row')).toHaveCount(1, { timeout: 15_000 });
    await expect(flow.locator('.flow-history-row').first()).toContainText('passos ok');

    const list = await request.get('/api/agent-room/workspaces');
    const workspace = ((await list.json()).data as Array<{ id: string; name: string }>).find((item) => item.name === workspaceName)!;
    await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
  });

  test('fluxo com agente spawna a sessão sozinho e conclui', async ({ page, request }) => {
    const workspaceName = `E2E fluxo-spawn ${Date.now()}`;

    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretório de trabalho').fill('/tmp');
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();

    // Terminal shell (sem esperar spawn) + fluxo com passo de agente, tudo via API
    const list = await request.get('/api/agent-room/workspaces');
    const workspace = ((await list.json()).data as Array<{ id: string; name: string }>).find((item) => item.name === workspaceName)!;
    await request.post(`/api/agent-room/workspaces/${workspace.id}/nodes`, {
      data: { type: 'terminal', title: 'Gato', x: 700, y: 100, width: 480, height: 320, payload: { command: '/bin/cat', args: [] } },
    });
    const flowResponse = await request.post(`/api/agent-room/workspaces/${workspace.id}/nodes`, {
      data: {
        type: 'flow',
        title: 'Pipeline',
        x: 100,
        y: 100,
        width: 480,
        height: 420,
        payload: { steps: [{ kind: 'agent', target: 'Gato', prompt: 'ola {{input}}' }], iterations: 1 },
      },
    });
    const flowId = ((await flowResponse.json()).data as { id: string }).id;

    // Roda pela API: o terminal nunca foi aberto — o FlowService spawna a sessão
    const run = await request.post(`/api/agent-room/workspaces/${workspace.id}/flows/run`, {
      data: { nodeId: flowId, input: 'mundo' },
    });
    expect(run.status()).toBe(202);

    await expect
      .poll(
        async () => {
          const nodes = await request.get(`/api/agent-room/workspaces/${workspace.id}/nodes`);
          const flowNode = ((await nodes.json()).data as Array<{ id: string; payload: { runs?: unknown[] } }>).find((node) => node.id === flowId)!;
          return (flowNode.payload.runs ?? []).length;
        },
        { timeout: 20_000, intervals: [500, 1000, 1000, 2000] }
      )
      .toBe(1);

    // A UI mostra o histórico (live refresh)
    await page.reload();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();
    await expect(page.locator('.canvas-flow .flow-history-row')).toHaveCount(1, { timeout: 15_000 });

    await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
  });
});
