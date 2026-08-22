import { FormRequest } from '@beeblock/svelar/forms';
import { saveWorkspaceMemorySchema, type SaveWorkspaceMemoryInput } from '../../../contracts/schemas/workspace-memory.schema.js';

export class SaveWorkspaceMemoryRequest extends FormRequest {
  rules() { return saveWorkspaceMemorySchema; }
  authorize(): boolean { return true; }
  passedValidation(data: unknown): SaveWorkspaceMemoryInput { return saveWorkspaceMemorySchema.parse(data); }
}
