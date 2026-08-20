import type { Page } from '@playwright/test';

/** Seleciona um provider no menu compacto de agentes da toolbar. */
export async function selectAgentTool(page: Page, providerName: string) {
  await page.getByTestId('agent-toolbar-menu').click();
  await page.getByRole('menuitem').filter({ hasText: providerName }).click();
}

/** Seleciona uma ferramenta icon-only pelo texto interno, independente do tooltip traduzido. */
export async function selectCanvasTool(page: Page, buttonName: string) {
  await page.locator('.toolbar button').filter({ hasText: buttonName }).click();
}

/**
 * Cria um no no canvas: clica na ferramenta da toolbar e depois clica no
 * fundo do canvas (o no nasce com tamanho padrao nessa posicao). Terminais
 * e agentes abrem o dialogo de criacao — confirma com o nome padrao.
 * O lookup e escopado na .toolbar para nao colidir com nomes de workspace.
 */
export async function createNodeOnCanvas(page: Page, buttonName: string, position = { x: 600, y: 400 }) {
  const dialog = page.locator('[role="dialog"]');
  // Garante que o dialog da criacao ANTERIOR ja fechou (animacao de saida)
  // — senao o waitFor abaixo resolve no dialog velho e o novo fica aberto.
  await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  await selectCanvasTool(page, buttonName);
  await page.locator('.svelte-flow__pane').click({ position });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 2_000 });
    await dialog.getByRole('button', { name: 'Criar agente' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  } catch {
    // nos sem dialogo (nota, arquivos...) nascem direto
  }
}
