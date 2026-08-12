import type { WorkspaceAttachment } from '../../domain/types.js';

export class WorkspaceAttachmentDto {
  private constructor(
    readonly kind: 'file' | 'link',
    readonly name: string,
    readonly file: File | null,
    readonly url: string | null,
  ) {}

  static fromFile(file: File): WorkspaceAttachmentDto {
    return new WorkspaceAttachmentDto('file', file.name, file, null);
  }

  static fromLink(url: string): WorkspaceAttachmentDto {
    const parsed = new URL(url);
    let pathname = parsed.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // A valid URL may still contain a malformed percent escape in its path.
    }
    pathname = pathname.replace(/\/$/, '');
    return new WorkspaceAttachmentDto('link', pathname.split('/').at(-1) || parsed.hostname, null, parsed.toString());
  }
}

export class WorkspaceAttachmentDeleteDto {
  private constructor(readonly attachment: WorkspaceAttachment) {}

  static fromAttachment(attachment: WorkspaceAttachment): WorkspaceAttachmentDeleteDto {
    return new WorkspaceAttachmentDeleteDto(attachment);
  }
}
