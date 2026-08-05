import { expect, test } from '@playwright/test';
import { createNodeOnCanvas } from './helpers.js';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.describe('arquivos e editor no canvas', () => {
  test('abre arquivo da arvore no editor, edita e salva', async ({ page, request }) => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-e2e-fs-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'hello.ts'), 'export const hello = "ola";\n');
    const workspaceName = `E2E fs ${Date.now()}`;

    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretório de trabalho').fill(dir);
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();
    await expect(page.locator('.workspace-list li.active')).toContainText(workspaceName);

    // Abre a arvore de arquivos e navega ate src/hello.ts
    await createNodeOnCanvas(page, 'Arquivos');
    const tree = page.locator('.canvas-filetree');
    await expect(tree).toBeVisible();
    await tree.getByText('src').click();
    await tree.getByText('hello.ts').dblclick();

    // Editor abre com o conteudo
    const editor = page.locator('.canvas-editor');
    await expect(editor).toBeVisible();
    await expect(editor.locator('.cm-content')).toContainText('export const hello = "ola";', { timeout: 10_000 });

    // Edita e salva com Ctrl+S
    await editor.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.type('// editado');
    await page.keyboard.press('Control+s');
    await expect(editor.locator('.dirty-badge')).toHaveCount(0, { timeout: 5_000 });

    expect(readFileSync(join(dir, 'src', 'hello.ts'), 'utf8')).toContain('// editado');

    // Persiste como no do canvas
    await page.reload();
    await expect(page.locator('.canvas-editor')).toBeVisible();

    const list = await request.get('/api/agent-room/workspaces');
    const workspaces = (await list.json()).data as Array<{ id: string; name: string }>;
    const created = workspaces.find((workspace) => workspace.name === workspaceName);
    if (created) await request.delete(`/api/agent-room/workspaces/${created.id}`);
  });

  test('arvore mostra branch e status git', async ({ page, request }) => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-e2e-git-'));
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'e2e@orkestrai.local'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'E2E'], { cwd: dir });
    writeFileSync(join(dir, 'README.md'), '# x\n');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });
    writeFileSync(join(dir, 'README.md'), '# x mudou\n');

    const workspaceName = `E2E git ${Date.now()}`;
    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretório de trabalho').fill(dir);
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();
    await expect(page.locator('.workspace-list li.active')).toContainText(workspaceName);

    await createNodeOnCanvas(page, 'Arquivos');
    const tree = page.locator('.canvas-filetree');
    await expect(tree.locator('.branch-badge')).toContainText('main');
    await expect(tree.locator('.entry-status')).toHaveCount(1);

    const list = await request.get('/api/agent-room/workspaces');
    const workspaces = (await list.json()).data as Array<{ id: string; name: string }>;
    const created = workspaces.find((workspace) => workspace.name === workspaceName);
    if (created) await request.delete(`/api/agent-room/workspaces/${created.id}`);
  });

  test('diff viewer mostra alteracoes e faz stage', async ({ page, request }) => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-e2e-diff-'));
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'e2e@orkestrai.local'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'E2E'], { cwd: dir });
    writeFileSync(join(dir, 'app.ts'), 'const v = 1;\n');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });
    writeFileSync(join(dir, 'app.ts'), 'const v = 2;\n');

    const workspaceName = `E2E diff ${Date.now()}`;
    await page.goto('/canvas');
    await page.getByRole('button', { name: 'Novo workspace' }).click();
    await page.getByPlaceholder('Nome').fill(workspaceName);
    await page.getByPlaceholder('Diretório de trabalho').fill(dir);
    await page.getByRole('button', { name: 'Criar' }).click();
    await page.locator('.workspace-list .workspace-item', { hasText: workspaceName }).click();

    await createNodeOnCanvas(page, 'Diff');
    const diff = page.locator('.canvas-diff');
    await expect(diff).toBeVisible();
    await expect(diff.locator('.branch-badge')).toContainText('main');

    // Seleciona o arquivo alterado e ve o diff
    await diff.locator('.change-open', { hasText: 'app.ts' }).click();
    await expect(diff.locator('.diff-text')).toContainText('const v = 2');
    await expect(diff.locator('.diff-text')).toContainText('const v = 1');

    // Stage pelo botao
    await diff.getByRole('button', { name: 'stage' }).first().click();
    await expect(diff.locator('.change-status')).toContainText('M*', { timeout: 10_000 });

    const list = await request.get('/api/agent-room/workspaces');
    const workspaces = (await list.json()).data as Array<{ id: string; name: string }>;
    const created = workspaces.find((workspace) => workspace.name === workspaceName);
    if (created) await request.delete(`/api/agent-room/workspaces/${created.id}`);
  });
});
