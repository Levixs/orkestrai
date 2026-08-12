import { afterEach, describe, expect, it } from 'vitest';
import { File } from 'node:buffer';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import {
  WorkspaceAttachmentDeleteDto,
  WorkspaceAttachmentDto,
} from '$lib/modules/agent-room/application/dto/WorkspaceAttachmentDto.js';
import { workspaceAttachmentService } from '$lib/modules/agent-room/application/services/WorkspaceAttachmentService.js';
import {
  MAX_WORKSPACE_ATTACHMENT_BYTES,
  workspaceAttachmentSchema,
  workspaceAttachmentLinkSchema,
} from '$lib/modules/agent-room/contracts/schemas/workspaceAttachmentSchemas.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

const tempDirs: string[] = [];

describe('WorkspaceAttachmentService', () => {
  useSvelarTest({ refreshDatabase: true });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('stores files in the workspace attachment directory with a safe relative path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-attachment-'));
    tempDirs.push(dir);
    const workspace = await workspaceRepository.createWorkspace({ name: 'attachments', workingDir: dir });
    const file = new File(['# Brief\n'], '../brief coração?.md', { type: 'text/markdown' });

    const attachment = await workspaceAttachmentService.create(
      workspace.id,
      WorkspaceAttachmentDto.fromFile(file as unknown as globalThis.File),
    );

    expect(attachment).toMatchObject({
      kind: 'file',
      name: '../brief coração?.md',
      url: null,
      mimeType: 'text/markdown',
      size: file.size,
    });
    expect(attachment.path).toMatch(/^\.orkestrai\/attachments\/[0-9a-f-]+-brief-coracao-.md$/);
    expect(existsSync(join(dir, attachment.path!))).toBe(true);
    expect(readFileSync(join(dir, attachment.path!), 'utf8')).toBe('# Brief\n');
    expect(workspaceAttachmentSchema.parse(attachment)).toEqual(attachment);

    await workspaceAttachmentService.remove(
      workspace.id,
      WorkspaceAttachmentDeleteDto.fromAttachment(attachment),
    );
    expect(existsSync(join(dir, attachment.path!))).toBe(false);

    await expect(workspaceAttachmentService.remove(
      workspace.id,
      WorkspaceAttachmentDeleteDto.fromAttachment(attachment),
    )).resolves.toBeUndefined();
  });

  it('refuses to delete an attachment path that does not belong to its identifier', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-attachment-delete-'));
    tempDirs.push(dir);
    const workspace = await workspaceRepository.createWorkspace({ name: 'delete guard', workingDir: dir });
    const attachment = await workspaceAttachmentService.create(
      workspace.id,
      WorkspaceAttachmentDto.fromFile(new File(['data'], 'guard.txt') as unknown as globalThis.File),
    );
    const forged = { ...attachment, id: '00000000-0000-4000-8000-000000000003' };

    await expect(workspaceAttachmentService.remove(
      workspace.id,
      WorkspaceAttachmentDeleteDto.fromAttachment(forged),
    )).rejects.toThrow('does not match');
    expect(existsSync(join(dir, attachment.path!))).toBe(true);
  });

  it('rejects oversized files and unsafe persisted paths or protocols', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-attachment-limit-'));
    tempDirs.push(dir);
    const workspace = await workspaceRepository.createWorkspace({ name: 'limits', workingDir: dir });
    const oversized = new File(
      [new Uint8Array(MAX_WORKSPACE_ATTACHMENT_BYTES + 1)],
      'oversized.bin',
      { type: 'application/octet-stream' },
    );

    await expect(workspaceAttachmentService.create(
      workspace.id,
      WorkspaceAttachmentDto.fromFile(oversized as unknown as globalThis.File),
    )).rejects.toThrow('10 MB');

    expect(workspaceAttachmentSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000003',
      kind: 'file',
      name: 'passwd',
      path: '../../etc/passwd',
      url: null,
      mimeType: 'text/plain',
      size: 10,
    }).success).toBe(false);
    expect(workspaceAttachmentLinkSchema.safeParse({ url: 'file:///etc/passwd' }).success).toBe(false);
    expect(workspaceAttachmentLinkSchema.safeParse({ url: 'https://example.com/spec' }).success).toBe(true);
  });
});
