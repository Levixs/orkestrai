import { afterEach, describe, expect, it } from 'vitest';
import { File } from 'node:buffer';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { PortalDesignFeedbackDto } from '$lib/modules/agent-room/application/dto/PortalDesignFeedbackDto.js';
import {
  portalDesignFeedbackService,
  redactPortalText,
} from '$lib/modules/agent-room/application/services/PortalDesignFeedbackService.js';
import { taskBoardService } from '$lib/modules/agent-room/application/services/TaskBoardService.js';
import { workspaceAttachmentService } from '$lib/modules/agent-room/application/services/WorkspaceAttachmentService.js';
import { WorkspaceAttachmentDto } from '$lib/modules/agent-room/application/dto/WorkspaceAttachmentDto.js';
import {
  portalDesignCaptureSchema,
  sendPortalDesignFeedbackSchema,
} from '$lib/modules/agent-room/contracts/schemas/portal-design-feedback.schema.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { SendPortalDesignFeedbackRequest } from '$lib/modules/agent-room/interface/http/requests/SendPortalDesignFeedbackRequest.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.js';

const tempDirs: string[] = [];

function capture() {
  return portalDesignCaptureSchema.parse({
    selector: 'main > button.cta',
    tagName: 'button',
    html: '<button class="cta" data-token="must-not-leave">Buy now</button>',
    text: 'Buy now api_key=super-secret-value',
    role: 'button',
    ariaLabel: 'Buy now',
    rect: { x: 24, y: 48, width: 180, height: 44 },
    viewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
    page: { origin: 'https://example.com', path: '/checkout', title: 'Checkout' },
    styles: {
      display: 'inline-flex', position: 'static', color: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(124, 58, 237)', fontFamily: 'Inter', fontSize: '16px',
      fontWeight: '600', lineHeight: '24px', textAlign: 'center', border: '0px none',
      borderRadius: '6px', padding: '10px 16px', margin: '0px', width: '180px', height: '44px',
    },
  });
}

async function createFeedbackScenario(name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'orkestrai-portal-design-'));
  tempDirs.push(dir);
  const workspace = await workspaceRepository.createWorkspace({ name, workingDir: dir });
  const portal = await workspaceRepository.createNode({
    workspaceId: workspace.id,
    type: 'portal',
    title: 'Checkout preview',
    payload: { url: 'https://example.com/checkout' },
  });
  const screenshot = await workspaceAttachmentService.create(
    workspace.id,
    WorkspaceAttachmentDto.fromFile(new File([
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ], 'portal-selection.png', { type: 'image/png' }) as unknown as globalThis.File),
  );
  const { html: _previewOnly, ...context } = capture();
  return { workspace, portal, screenshot, context };
}

describe('PortalDesignFeedbackService', () => {
  useSvelarTest({ refreshDatabase: true });

  afterEach(() => {
    ptySessionManager.killAll();
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('persists a cropped capture and redacted context on the selected task', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-portal-design-'));
    tempDirs.push(dir);
    const workspace = await workspaceRepository.createWorkspace({ name: 'design', workingDir: dir });
    const portal = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'portal',
      title: 'Checkout preview',
      payload: { url: 'https://example.com/checkout?token=hidden' },
    });
    const task = await taskBoardService.create(workspace.id, {
      title: 'Polish checkout',
      description: 'Keep the existing context.',
      createdBy: 'agent',
    });
    const screenshot = await workspaceAttachmentService.create(
      workspace.id,
      WorkspaceAttachmentDto.fromFile(new File([
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ], 'portal-selection.png', { type: 'image/png' }) as unknown as globalThis.File),
    );
    const { html: _previewOnly, ...context } = capture();
    const input = sendPortalDesignFeedbackSchema.parse({
      capture: context,
      screenshot,
      instruction: 'Increase contrast. password=do-not-send',
      destination: { kind: 'task', taskId: task.id },
    });

    const result = await portalDesignFeedbackService.send(
      workspace.id,
      portal.id,
      PortalDesignFeedbackDto.fromInput(input),
    );
    const updated = (await taskBoardService.list(workspace.id))[0];

    expect(result).toMatchObject({
      destinationKind: 'task', destinationId: task.id, taskId: task.id, persisted: true, delivery: null,
    });
    expect(updated.description).toContain('Keep the existing context.');
    expect(updated.description).toContain('https://example.com/checkout');
    expect(updated.description).toContain('api_key=[redacted]');
    expect(updated.description).toContain('password=[redacted]');
    expect(updated.description).not.toContain('super-secret-value');
    expect(updated.description).not.toContain('do-not-send');
    expect(updated.description).not.toContain('?token=hidden');
    expect(updated.attachments).toEqual([screenshot]);
    expect(updated.images).toEqual([screenshot.path]);
  });

  it('creates an unassigned Kanban task when feedback is sent for leader triage', async () => {
    const { workspace, portal, screenshot, context } = await createFeedbackScenario('triage feedback');
    const input = sendPortalDesignFeedbackSchema.parse({
      capture: context,
      screenshot,
      instruction: 'Make the primary action easier to identify.',
      destination: { kind: 'triage' },
    });

    const result = await portalDesignFeedbackService.send(
      workspace.id,
      portal.id,
      PortalDesignFeedbackDto.fromInput(input),
    );
    const tasks = await taskBoardService.list(workspace.id);

    expect(tasks).toHaveLength(1);
    expect(result).toMatchObject({
      destinationKind: 'triage', destinationId: tasks[0].id, taskId: tasks[0].id,
      persisted: true, delivery: null,
    });
    expect(tasks[0]).toMatchObject({ assigneeNodeId: null, status: 'todo' });
    expect(tasks[0].description).toContain('Make the primary action easier to identify.');
    expect(tasks[0].attachments).toEqual([screenshot]);
  });

  it('tracks direct agent feedback as an assigned Kanban task', async () => {
    const { workspace, portal, screenshot, context } = await createFeedbackScenario('assigned feedback');
    const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    const agent = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Frontend reviewer',
      payload: { provider: 'claude', command: 'claude', role: 'Frontend reviewer', sessionId: session.id },
    });
    const input = sendPortalDesignFeedbackSchema.parse({
      capture: context,
      screenshot,
      instruction: 'Align this control with the form grid.',
      destination: { kind: 'agent', nodeId: agent.id },
    });

    const result = await portalDesignFeedbackService.send(
      workspace.id,
      portal.id,
      PortalDesignFeedbackDto.fromInput(input),
    );
    const tasks = await taskBoardService.list(workspace.id);

    expect(tasks).toHaveLength(1);
    expect(result).toMatchObject({
      destinationKind: 'agent', destinationId: agent.id, destinationTitle: 'Frontend reviewer',
      taskId: tasks[0].id, persisted: true,
    });
    expect(tasks[0]).toMatchObject({ assigneeNodeId: agent.id, assigneeTitle: 'Frontend reviewer', status: 'doing' });
    expect(tasks[0].attachments).toEqual([screenshot]);
  });

  it('keeps raw HTML preview-only and rejects unsafe page or screenshot context', () => {
    const selected = capture();
    expect(sendPortalDesignFeedbackSchema.safeParse({
      capture: selected,
      screenshot: {
        id: '00000000-0000-4000-8000-000000000003', kind: 'file', name: 'capture.jpg',
        path: '.orkestrai/attachments/capture.jpg', url: null, mimeType: 'image/jpeg', size: 100,
      },
      instruction: 'Fix this.',
      destination: { kind: 'agent', nodeId: '00000000-0000-4000-8000-000000000004' },
    }).success).toBe(false);
    expect(portalDesignCaptureSchema.safeParse({
      ...selected,
      page: { ...selected.page, path: '/checkout?token=secret' },
    }).success).toBe(false);
    expect(redactPortalText('Authorization: Bearer abcdefghijklmnop')).not.toContain('abcdefghijklmnop');
  });

  it('rejects a file named as PNG when its bytes are not a PNG', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-portal-design-'));
    tempDirs.push(dir);
    const workspace = await workspaceRepository.createWorkspace({ name: 'invalid capture', workingDir: dir });
    const portal = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'portal',
      title: 'Preview',
      payload: { url: 'https://example.com' },
    });
    const task = await taskBoardService.create(workspace.id, {
      title: 'Review preview',
      description: '',
      createdBy: 'agent',
    });
    const screenshot = await workspaceAttachmentService.create(
      workspace.id,
      WorkspaceAttachmentDto.fromFile(new File([
        'this is not a png',
      ], 'fake.png', { type: 'image/png' }) as unknown as globalThis.File),
    );
    const { html: _previewOnly, ...context } = capture();
    const input = sendPortalDesignFeedbackSchema.parse({
      capture: context,
      screenshot,
      instruction: 'Fix this.',
      destination: { kind: 'task', taskId: task.id },
    });

    await expect(portalDesignFeedbackService.send(
      workspace.id,
      portal.id,
      PortalDesignFeedbackDto.fromInput(input),
    )).rejects.toThrow('PNG válido');
  });

  it('accepts the workspace and portal route parameters merged by Svelar FormRequest', async () => {
    const { html: _previewOnly, ...context } = capture();
    const workspaceId = '00000000-0000-4000-8000-000000000001';
    const portalNodeId = '00000000-0000-4000-8000-000000000002';
    const taskId = '00000000-0000-4000-8000-000000000003';
    const body = {
      capture: context,
      screenshot: {
        id: '00000000-0000-4000-8000-000000000004',
        kind: 'file',
        name: 'capture.png',
        path: '.orkestrai/attachments/capture.png',
        url: null,
        mimeType: 'image/png',
        size: 100,
      },
      instruction: 'Improve the contrast.',
      destination: { kind: 'task', taskId },
    };

    const dto = await SendPortalDesignFeedbackRequest.validate({
      request: new Request('http://localhost/design-feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      url: new URL('http://localhost/design-feedback'),
      params: { id: workspaceId, nodeId: portalNodeId },
    } as never);

    expect(dto).toMatchObject({ instruction: 'Improve the contrast.', destination: { kind: 'task', taskId } });
  });
});
