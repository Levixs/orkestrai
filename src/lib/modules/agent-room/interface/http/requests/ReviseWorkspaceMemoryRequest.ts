import { FormRequest } from '@beeblock/svelar/forms';
import { reviseWorkspaceMemorySchema, type ReviseWorkspaceMemoryInput } from '../../../contracts/schemas/workspace-memory.schema.js';

export class ReviseWorkspaceMemoryRequest extends FormRequest {
  rules() { return reviseWorkspaceMemorySchema; }
  authorize(): boolean { return true; }
  passedValidation(data: unknown): ReviseWorkspaceMemoryInput { return reviseWorkspaceMemorySchema.parse(data); }
}
