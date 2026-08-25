import { FormRequest } from '@beeblock/svelar/forms';
import {
  createWorkspaceGroupSchema,
  moveWorkspaceSchema,
  updateWorkspaceGroupSchema,
  type CreateWorkspaceGroupInput,
  type MoveWorkspaceInput,
  type UpdateWorkspaceGroupInput,
} from '$lib/modules/agent-room/contracts/schemas/workspaceGroupSchemas.js';

export class CreateWorkspaceGroupRequest extends FormRequest {
  rules() {
    return createWorkspaceGroupSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): CreateWorkspaceGroupInput {
    return createWorkspaceGroupSchema.parse(data);
  }
}

export class UpdateWorkspaceGroupRequest extends FormRequest {
  rules() {
    return updateWorkspaceGroupSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): UpdateWorkspaceGroupInput {
    return updateWorkspaceGroupSchema.parse(data);
  }
}

export class MoveWorkspaceRequest extends FormRequest {
  rules() {
    return moveWorkspaceSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): MoveWorkspaceInput {
    return moveWorkspaceSchema.parse(data);
  }
}
