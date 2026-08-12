import { uuidv7 } from '@beeblock/svelar/support';
import type { WorkspaceAttachment } from '../../domain/types.js';
import { MAX_WORKSPACE_ATTACHMENT_BYTES } from '../../contracts/schemas/workspaceAttachmentSchemas.js';
import type { WorkspaceAttachmentDto } from '../dto/WorkspaceAttachmentDto.js';
import type { WorkspaceAttachmentDeleteDto } from '../dto/WorkspaceAttachmentDto.js';
import { filesystemService } from './FilesystemService.js';

function safeFilename(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120);
  return normalized || 'attachment';
}

function canonicalMime(name: string, declared: string): string {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  return {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
  }[extension] ?? (declared || 'application/octet-stream');
}

export class WorkspaceAttachmentService {
  async create(workspaceId: string, dto: WorkspaceAttachmentDto): Promise<WorkspaceAttachment> {
    if (dto.kind === 'link') {
      return {
        id: uuidv7(),
        kind: 'link',
        name: dto.name,
        path: null,
        url: dto.url,
        mimeType: null,
        size: null,
      };
    }

    const file = dto.file;
    if (!file || file.size <= 0) throw new Error('The attachment is empty.');
    if (file.size > MAX_WORKSPACE_ATTACHMENT_BYTES) throw new Error('The attachment exceeds the 10 MB limit.');
    const id = uuidv7();
    const path = `.orkestrai/attachments/${id}-${safeFilename(file.name)}`;
    await filesystemService.writeBinary(workspaceId, path, new Uint8Array(await file.arrayBuffer()));
    return {
      id,
      kind: 'file',
      name: file.name.slice(0, 180),
      path,
      url: null,
      mimeType: canonicalMime(file.name, file.type),
      size: file.size,
    };
  }

  async remove(workspaceId: string, dto: WorkspaceAttachmentDeleteDto): Promise<void> {
    const attachment = dto.attachment;
    if (attachment.kind === 'link') return;
    const expectedPrefix = `.orkestrai/attachments/${attachment.id}-`;
    if (!attachment.path?.startsWith(expectedPrefix)) {
      throw new Error('The attachment path does not match its identifier.');
    }
    await filesystemService.deleteFile(workspaceId, attachment.path);
  }
}

export const workspaceAttachmentService = new WorkspaceAttachmentService();
