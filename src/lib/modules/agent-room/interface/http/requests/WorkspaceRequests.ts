import { FormRequest } from '@beeblock/svelar/forms';
import {
  createCanvasEdgeSchema,
  createCanvasNodeSchema,
  createWorkspaceSchema,
  updateCanvasEdgeSchema,
  updateCanvasNodeSchema,
  updateWorkspaceSchema,
  type CreateCanvasEdgeInput,
  type CreateCanvasNodeInput,
  type CreateWorkspaceInput,
  type UpdateCanvasEdgeInput,
  type UpdateCanvasNodeInput,
  type UpdateWorkspaceInput,
} from '$lib/modules/agent-room/contracts/schemas/workspaceSchemas.js';

export class CreateWorkspaceRequest extends FormRequest {
  rules() {
    return createWorkspaceSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): CreateWorkspaceInput {
    return createWorkspaceSchema.parse(data);
  }
}

export class UpdateWorkspaceRequest extends FormRequest {
  rules() {
    return updateWorkspaceSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): UpdateWorkspaceInput {
    return updateWorkspaceSchema.parse(data);
  }
}

export class CreateCanvasNodeRequest extends FormRequest {
  rules() {
    return createCanvasNodeSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): CreateCanvasNodeInput {
    return createCanvasNodeSchema.parse(data);
  }
}

export class UpdateCanvasNodeRequest extends FormRequest {
  rules() {
    return updateCanvasNodeSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): UpdateCanvasNodeInput {
    return updateCanvasNodeSchema.parse(data);
  }
}

export class CreateCanvasEdgeRequest extends FormRequest {
  rules() {
    return createCanvasEdgeSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): CreateCanvasEdgeInput {
    return createCanvasEdgeSchema.parse(data);
  }
}

export class UpdateCanvasEdgeRequest extends FormRequest {
  rules() {
    return updateCanvasEdgeSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): UpdateCanvasEdgeInput {
    return updateCanvasEdgeSchema.parse(data);
  }
}
