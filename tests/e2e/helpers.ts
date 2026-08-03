import type { Page } from '@playwright/test';

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
  await page.locator('.toolbar').getByRole('button', { name: buttonName, exact: true }).click();
  await page.locator('.svelte-flow__pane').click({ position });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 2_000 });
    await dialog.getByRole('button', { name: 'Criar agente' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  } catch {
    // nos sem dialogo (nota, arquivos...) nascem direto
  }
}
