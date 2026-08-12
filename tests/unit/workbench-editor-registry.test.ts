import { describe, expect, it } from 'vitest';
import type { editor } from 'monaco-editor';
import {
  discardWorkbenchEditorBuffer,
  getWorkbenchEditorBuffer,
  isWorkbenchEditorBufferDirty,
  markWorkbenchEditorBufferSaved,
  registerWorkbenchEditorBuffer,
  workbenchEditorBufferKey,
} from '$lib/components/agent-room/workbench-editor-registry.js';

function fakeModel(initial: string) {
  let value = initial;
  let version = 1;
  let disposed = false;
  return {
    getValue: () => value,
    setValue: (next: string) => {
      value = next;
      version += 1;
    },
    getAlternativeVersionId: () => version,
    dispose: () => (disposed = true),
    disposed: () => disposed,
  };
}

describe('Workbench editor model registry', () => {
  it('preserva o mesmo model por URI e rastreia save/discard sem perder silenciosamente', () => {
    const workspaceId = crypto.randomUUID();
    const path = `/tmp/${crypto.randomUUID()}.ts`;
    const model = fakeModel('const value = 1;');
    const buffer = registerWorkbenchEditorBuffer({
      key: workbenchEditorBufferKey(workspaceId, path),
      workspaceId,
      path,
      model: model as unknown as editor.ITextModel,
      savedAlternativeVersionId: 1,
      savedValue: model.getValue(),
      truncated: false,
      viewState: null,
    });

    expect(getWorkbenchEditorBuffer(workspaceId, path)?.model).toBe(buffer.model);
    model.setValue('const value = 2;');
    expect(isWorkbenchEditorBufferDirty(workspaceId, path)).toBe(true);
    markWorkbenchEditorBufferSaved(buffer);
    expect(isWorkbenchEditorBufferDirty(workspaceId, path)).toBe(false);
    model.setValue('const value = 3;');
    discardWorkbenchEditorBuffer(workspaceId, path);
    expect(getWorkbenchEditorBuffer(workspaceId, path)).toBeNull();
    expect(model.disposed()).toBe(true);
  });
});
