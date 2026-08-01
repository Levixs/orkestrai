import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (err) => console.log('PAGEERROR:', err.message.slice(0, 200)));
await page.addInitScript(() => localStorage.setItem('orkestrai.onboarded', '1'));
await page.goto('http://localhost:5199/canvas', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const name = `live ${Date.now()}`;
await page.getByRole('button', { name: 'Novo workspace' }).click();
await page.getByPlaceholder('Nome').fill(name);
await page.getByPlaceholder('Diretorio de trabalho').fill('/tmp');
await page.getByRole('button', { name: 'Criar' }).click();
await page.waitForTimeout(900);
console.log('notas antes:', await page.locator('.canvas-note').count());

// cria nota + edge via bridge (como um agente faria)
const list = await (await page.request.get('http://localhost:5199/api/agent-room/workspaces')).json();
const ws = list.data.find((w) => w.name === name);
const tok = await (await page.request.get(`http://localhost:5199/api/agent-room/workspaces/${ws.id}/bridge-token`)).json();
const headers = { authorization: `Bearer ${tok.data.token}`, 'content-type': 'application/json' };
const res = await page.request.post('http://localhost:5199/api/agent-room/bridge/notes', { headers, data: { title: 'Nota da bridge', content: 'apareci sozinha' } });
console.log('bridge note status:', res.status());
await page.waitForTimeout(1200);
console.log('notas depois (sem recarregar):', await page.locator('.canvas-note').count());

await page.request.delete(`http://localhost:5199/api/agent-room/workspaces/${ws.id}`);
await browser.close();
