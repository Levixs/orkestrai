import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { IosSimulatorAdapter } from '$lib/modules/agent-room/application/adapters/devices/IosSimulatorAdapter.js';
import type { DeviceRuntimeSession } from '$lib/modules/agent-room/application/adapters/devices/types.js';

const manualDescribe = process.env.ORKESTRAI_TEST_IOS_DEVICE === '1' ? describe : describe.skip;

manualDescribe('iOS device adapter (manual)', () => {
  const adapter = new IosSimulatorAdapter();
  const screenshotDirectory = join(tmpdir(), `orkestrai-ios-device-${process.pid}`);
  let session: DeviceRuntimeSession | null = null;

  afterEach(async () => {
    if (session) await adapter.stop(session);
    session = null;
    rmSync(screenshotDirectory, { recursive: true, force: true });
  });

  it('streams and controls an available Apple Simulator', async () => {
    const devices = await adapter.list();
    const device = devices.find((candidate) => candidate.name === 'iPhone 17 Pro')
      ?? devices.find((candidate) => candidate.name.includes('iPhone'))
      ?? devices[0];
    expect(device).toBeDefined();

    session = await adapter.start('00000000-0000-4000-8000-000000000001', device!);
    expect(session.public.status).toBe('streaming');
    expect(await adapter.health(session)).toBe(true);

    const context = { workspaceRoot: process.cwd(), screenshotDirectory };
    await adapter.command(session, { command: 'tap', x: 0.5, y: 0.5 }, context);
    await adapter.command(session, {
      command: 'pinch',
      centerX: 0.5,
      centerY: 0.5,
      startDistance: 0.2,
      endDistance: 0.4,
      durationMs: 100,
    }, context);
    const tree = await adapter.command(session, { command: 'tree' }, context);
    const screenshot = await adapter.command(session, { command: 'screenshot' }, context);
    const permissions = await adapter.command(session, { command: 'permissions', action: 'list' }, context);

    expect(tree?.kind).toBe('tree');
    expect(screenshot?.kind).toBe('screenshot');
    expect(screenshot?.kind === 'screenshot' && existsSync(screenshot.path)).toBe(true);
    expect(permissions?.kind).toBe('permissions');
  }, 240_000);
});
