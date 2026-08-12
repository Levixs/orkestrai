import { expect, test } from '@playwright/test';
import { copyFileSync, createWriteStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';

function writePdf(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 48 });
    const stream = createWriteStream(path);
    stream.on('finish', resolve);
    stream.on('error', reject);
    document.pipe(stream);
    document.fontSize(22).text('Orkestrai Workbench');
    document.moveDown().fontSize(12).text('PDF preview validation');
    document.end();
  });
}

test.describe('Workbench editor', () => {
  test('preserves a dirty Monaco buffer across artifacts and saves it with the platform shortcut', async ({ page, request }) => {
    test.setTimeout(90_000);
    const consoleWarnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') consoleWarnings.push(message.text());
    });
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-workbench-editor-'));
    const sourcePath = join(dir, 'sample.ts');
    writeFileSync(sourcePath, 'export const phase = 3;\n');
    const settingsResponse = await request.get('/api/agent-room/settings');
    const originalSettings = (await settingsResponse.json()).data as Record<string, string>;
    const workspaceResponse = await request.post('/api/agent-room/workspaces', {
      data: { name: `E2E Workbench editor ${Date.now()}`, workingDir: dir },
    });
    const workspace = (await workspaceResponse.json()).data as { id: string };
    const noteResponse = await request.post(`/api/agent-room/workspaces/${workspace.id}/nodes`, {
      data: {
        type: 'note',
        title: 'Editor switch note',
        x: 780,
        y: 100,
        width: 360,
        height: 260,
        payload: { content: '# Keep the unsaved buffer' },
      },
    });
    const noteNode = (await noteResponse.json()).data as { id: string };

    try {
      await request.put('/api/agent-room/settings', {
        data: { ...originalSettings, uiLanguage: 'en', workbenchTabPlacement: 'vertical', editorAutoSave: 'false' },
      });
      await page.goto(`/terminal?workspace=${workspace.id}`);
      const fileExplorer = page.getByTestId('workbench-file-explorer');
      await fileExplorer.getByRole('button', { name: 'sample.ts', exact: true }).click();
      const fileView = page.getByTestId('workbench-file-view');
      await expect(fileView.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
      await expect(fileView).toContainText('text/typescript');
      expect(consoleWarnings.filter((message) => message.includes('Could not create web worker'))).toEqual([]);

      const input = fileView.getByRole('textbox', { name: 'Editor content' });
      await input.focus();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
      await input.pressSequentially('// preserved in Workbench', { delay: 5 });
      const editorTab = page.getByTestId('workbench-vertical-tabs').getByRole('button', { name: /^sample\.ts/ });
      await expect(editorTab).toHaveAccessibleName(/Unsaved changes/);

      const noteItem = page.getByTestId('terminal-workspace-tree').getByRole('button', { name: /^Editor switch note Note$/ });
      await noteItem.click();
      await expect(page.getByTestId('workbench-pane-primary').locator('.canvas-note')).toBeVisible();
      await editorTab.click();
      await expect(fileView.locator('.monaco-editor')).toBeVisible();
      await expect(fileView.locator('.view-lines')).toContainText('preserved in Workbench');

      await fileView.getByRole('textbox', { name: 'Editor content' }).focus();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
      await expect(editorTab).not.toHaveAccessibleName(/Unsaved changes/, { timeout: 5_000 });
      expect(readFileSync(sourcePath, 'utf8')).toContain('// preserved in Workbench');

      const nodesResponse = await request.get(`/api/agent-room/workspaces/${workspace.id}/nodes`);
      const persistedNodes = (await nodesResponse.json()).data as Array<{ type: string }>;
      expect(persistedNodes.some((node) => node.type === 'editor')).toBe(false);

      await page.reload();
      await expect(fileView.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
      await expect(fileView.locator('.view-lines')).toContainText('preserved in Workbench');

      await noteItem.click();
      await expect(page).toHaveURL(new RegExp(`node=${noteNode.id}`));
    } finally {
      await request.put('/api/agent-room/settings', { data: originalSettings });
      await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('previews Markdown, images, and PDFs inside the Workbench', async ({ page, request }) => {
    test.setTimeout(90_000);
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-workbench-preview-'));
    const markdownPath = join(dir, 'brief.md');
    const imagePath = join(dir, 'preview.png');
    const pdfPath = join(dir, 'preview.pdf');
    writeFileSync(markdownPath, '# Preview heading\n\nA rendered **brief**.\n');
    copyFileSync(join(process.cwd(), 'electron/resources/icons/256x256.png'), imagePath);
    await writePdf(pdfPath);

    const settingsResponse = await request.get('/api/agent-room/settings');
    const originalSettings = (await settingsResponse.json()).data as Record<string, string>;
    const workspaceResponse = await request.post('/api/agent-room/workspaces', {
      data: { name: `E2E Workbench previews ${Date.now()}`, workingDir: dir },
    });
    const workspace = (await workspaceResponse.json()).data as { id: string };

    try {
      await request.put('/api/agent-room/settings', {
        data: { ...originalSettings, uiLanguage: 'en', workbenchTabPlacement: 'vertical' },
      });

      await page.goto(`/terminal?workspace=${workspace.id}`);
      const fileExplorer = page.getByTestId('workbench-file-explorer');
      await fileExplorer.getByRole('button', { name: 'brief.md', exact: true }).click();
      const fileView = page.getByTestId('workbench-file-view');
      await expect(fileView.getByRole('heading', { name: 'Preview heading' })).toBeVisible({ timeout: 30_000 });
      await fileView.getByRole('button', { name: 'Source' }).click();
      await expect(fileView.locator('.monaco-editor')).toBeVisible();

      await fileExplorer.getByRole('button', { name: 'preview.png', exact: true }).click();
      await expect(fileView.getByRole('img', { name: 'preview.png' })).toBeVisible();
      await expect(fileView).toContainText('256 × 256');

      await fileExplorer.getByRole('button', { name: 'preview.pdf', exact: true }).click();
      await expect(fileView).toContainText('1 of 1', { timeout: 30_000 });
      await expect(fileView.locator('canvas')).toBeVisible();
      const canvasSize = await fileView.locator('canvas').evaluate((canvas: HTMLCanvasElement) => ({
        width: canvas.width,
        height: canvas.height,
      }));
      expect(canvasSize.width).toBeGreaterThan(0);
      expect(canvasSize.height).toBeGreaterThan(0);
    } finally {
      await request.put('/api/agent-room/settings', { data: originalSettings });
      await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
