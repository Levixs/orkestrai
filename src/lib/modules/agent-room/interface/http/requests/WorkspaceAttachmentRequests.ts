import { FormRequest } from '@beeblock/svelar/forms';
import {
  workspaceAttachmentDeleteSchema,
  workspaceAttachmentLinkSchema,
  workspaceAttachmentUploadSchema,
} from '$lib/modules/agent-room/contracts/schemas/workspaceAttachmentSchemas.js';
import {
  WorkspaceAttachmentDeleteDto,
  WorkspaceAttachmentDto,
} from '$lib/modules/agent-room/application/dto/WorkspaceAttachmentDto.js';

export class WorkspaceAttachmentUploadRequest extends FormRequest {
  rules() {
    return workspaceAttachmentUploadSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): WorkspaceAttachmentDto {
    const input = workspaceAttachmentUploadSchema.parse(data);
    return WorkspaceAttachmentDto.fromFile(input.file);
  }
}

export class WorkspaceAttachmentLinkRequest extends FormRequest {
  rules() {
    return workspaceAttachmentLinkSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): WorkspaceAttachmentDto {
    const input = workspaceAttachmentLinkSchema.parse(data);
    return WorkspaceAttachmentDto.fromLink(input.url);
  }
}

export class WorkspaceAttachmentDeleteRequest extends FormRequest {
  rules() {
    return workspaceAttachmentDeleteSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): WorkspaceAttachmentDeleteDto {
    const input = workspaceAttachmentDeleteSchema.parse(data);
    return WorkspaceAttachmentDeleteDto.fromAttachment(input.attachment);
  }
}
