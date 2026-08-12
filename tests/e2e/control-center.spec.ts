import { expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.describe('Control Center', () => {
  test('projects live agent state and verified message delivery in the Workbench', async ({ page, request }) => {
    test.setTimeout(45_000);
    const runId = Date.now();
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-control-center-'));
    const workspaceResponse = await request.post('/api/agent-room/workspaces', {
      data: { name: `E2E Control Center ${runId}`, workingDir: dir },
    });
    const workspace = (await workspaceResponse.json()).data as { id: string };
    const leaderResponse = await request.post(`/api/agent-room/workspaces/${workspace.id}/nodes`, {
      data: {
        type: 'terminal',
        title: `Leader ${runId}`,
        x: 100,
        y: 100,
        width: 480,
        height: 320,
        payload: { command: '/bin/cat', args: [], maestro: true, role: 'Orchestration lead' },
      },
    });
    const leader = (await leaderResponse.json()).data as { id: string; title: string };
    const workerResponse = await request.post(`/api/agent-room/workspaces/${workspace.id}/nodes`, {
      data: {
        type: 'terminal',
        title: `Reviewer ${runId}`,
        x: 620,
        y: 100,
        width: 480,
        height: 320,
        payload: { command: '/bin/cat', args: [], role: 'Product reviewer' },
      },
    });
    const worker = (await workerResponse.json()).data as { id: string; title: string };

    try {
      await page.goto(`/terminal?workspace=${workspace.id}&node=${worker.id}`);
      await expect(page.locator('.canvas-terminal .xterm')).toBeVisible({ timeout: 15_000 });
      await expect.poll(async () => {
        const response = await request.get(`/api/agent-room/workspaces/${workspace.id}/control-center`);
        const snapshot = (await response.json()).data as { agents: Array<{ nodeId: string; sessionAlive: boolean }> };
        return snapshot.agents.find((agent) => agent.nodeId === worker.id)?.sessionAlive ?? false;
      }).toBe(true);

      const bridge = JSON.parse(readFileSync(join(dir, '.orkestrai', 'workspace.json'), 'utf8')) as { token: string };
      const headers = { Authorization: `Bearer ${bridge.token}` };
      const message = `Confirm handoff ${runId}`;
      const askResponse = await request.post('/api/agent-room/bridge/ask', {
        headers,
        data: { from: leader.title, to: worker.title, message, timeoutMs: 7_000 },
      });
      const askPayload = await askResponse.json();
      expect(askResponse.ok(), JSON.stringify(askPayload)).toBe(true);
      const ask = askPayload.data as { replyConfirmed: boolean; deliveryState: string };
      expect(ask).toMatchObject({ replyConfirmed: true, deliveryState: 'replied' });

      await page.goto(`/terminal?workspace=${workspace.id}&node=workbench-control-center%3A${workspace.id}`);
      const center = page.getByTestId('control-center-view');
      await expect(center).toBeVisible();
      await expect(center).toContainText(message);
      await expect(center).toContainText(/Replied|Respondida|Respondido/);
      // The page opens its event socket after the initial workspace projection.
      await page.waitForTimeout(750);

      const activityResponse = await request.post('/api/agent-room/bridge/activity', {
        headers,
        data: { from: worker.title, state: 'blocked', action: 'Waiting for visual approval' },
      });
      expect(activityResponse.ok()).toBe(true);

      const workerRow = center.locator('article', { hasText: worker.title }).first();
      await expect(workerRow).toContainText(/Blocked|Bloqueado/);
      await expect(workerRow).toContainText('Waiting for visual approval');
    } finally {
      await page.goto('about:blank');
      await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
