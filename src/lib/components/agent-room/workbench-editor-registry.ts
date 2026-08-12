import type { editor } from 'monaco-editor';

export const WORKBENCH_EDITOR_STATE_EVENT = 'orkestrai:workbench-editor-state';

export type WorkbenchEditorBuffer = {
  key: string;
  workspaceId: string;
  path: string;
  model: editor.ITextModel;
  savedAlternativeVersionId: number;
  savedValue: string;
  truncated: boolean;
  viewState: editor.ICodeEditorViewState | null;
};

const buffers = new Map<string, WorkbenchEditorBuffer>();

export function workbenchEditorBufferKey(workspaceId: string, path: string): string {
  return `${workspaceId}:${path}`;
}

export function getWorkbenchEditorBuffer(workspaceId: string, path: string): WorkbenchEditorBuffer | null {
  return buffers.get(workbenchEditorBufferKey(workspaceId, path)) ?? null;
}

export function registerWorkbenchEditorBuffer(buffer: WorkbenchEditorBuffer): WorkbenchEditorBuffer {
  buffers.set(buffer.key, buffer);
  notifyWorkbenchEditorState(buffer.key);
  return buffer;
}

export function isWorkbenchEditorBufferDirty(workspaceId: string, path: string): boolean {
  const buffer = getWorkbenchEditorBuffer(workspaceId, path);
  return Boolean(buffer && buffer.model.getAlternativeVersionId() !== buffer.savedAlternativeVersionId);
}

export function markWorkbenchEditorBufferSaved(buffer: WorkbenchEditorBuffer): void {
  buffer.savedAlternativeVersionId = buffer.model.getAlternativeVersionId();
  buffer.savedValue = buffer.model.getValue();
  notifyWorkbenchEditorState(buffer.key);
}

export function discardWorkbenchEditorBuffer(workspaceId: string, path: string): void {
  const key = workbenchEditorBufferKey(workspaceId, path);
  const buffer = buffers.get(key);
  if (!buffer) return;
  buffer.model.setValue(buffer.savedValue);
  buffer.model.dispose();
  buffers.delete(key);
  notifyWorkbenchEditorState(key);
}

export function saveWorkbenchEditorViewState(
  buffer: WorkbenchEditorBuffer,
  viewState: editor.ICodeEditorViewState | null,
): void {
  buffer.viewState = viewState;
}

export function dirtyWorkbenchEditorKeys(): string[] {
  return [...buffers.values()]
    .filter((buffer) => buffer.model.getAlternativeVersionId() !== buffer.savedAlternativeVersionId)
    .map((buffer) => buffer.key);
}

export function notifyWorkbenchEditorState(key: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WORKBENCH_EDITOR_STATE_EVENT, { detail: { key } }));
}
