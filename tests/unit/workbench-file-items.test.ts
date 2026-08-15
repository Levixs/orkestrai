import { describe, expect, it } from 'vitest';
import {
  createWorkbenchFileItem,
  pathFromWorkbenchFileItemId,
  workbenchFileItemId,
  workbenchFilePathsFromLayout,
} from '../../src/lib/components/agent-room/workbench-file-items.js';

describe('workbench file items', () => {
  it('round-trips POSIX and Windows paths without creating backend ids', () => {
    for (const path of ['/tmp/project/src/App.svelte', 'C:\\work\\app\\src\\main.ts']) {
      expect(pathFromWorkbenchFileItemId(workbenchFileItemId(path))).toBe(path);
    }
  });

  it('restores unique file paths from recursive and legacy layouts', () => {
    const first = workbenchFileItemId('/tmp/first.ts');
    const second = workbenchFileItemId('/tmp/second.ts');
    expect(workbenchFilePathsFromLayout({
      root: {
        kind: 'split',
        children: [
          { kind: 'pane', nodeIds: [first, first] },
          { kind: 'pane', nodeIds: [second] },
        ],
      },
      panes: [{ nodeIds: [first] }],
    })).toEqual(['/tmp/first.ts', '/tmp/second.ts']);
  });

  it('creates an in-memory display item for existing Workbench renderers', () => {
    const item = createWorkbenchFileItem({
      id: 'workspace-1',
      name: 'Example',
      workingDir: '/tmp/example',
      runtimeKind: 'native',
      wslDistribution: null,
      wslWorkingDir: null,
      icon: null,
      instructions: null,
      syncAgentInstructionFiles: false,
      hooks: {},
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
    }, '/tmp/example/src/App.svelte');
    expect(item).toMatchObject({
      workspaceId: 'workspace-1',
      type: 'editor',
      title: 'App.svelte',
      payload: { path: '/tmp/example/src/App.svelte', workbenchFile: true },
    });
  });
});
