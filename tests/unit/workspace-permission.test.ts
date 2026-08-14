import { describe, expect, it } from 'vitest';
import { isWorkspacePermissionError } from '../../src/lib/components/agent-room/workspace-permission.js';

describe('workspace permission errors', () => {
  it.each([
    'EPERM: operation not permitted, access /protected/project',
    'EACCES: permission denied, scandir /protected/project',
    'Operation not permitted',
  ])('recognizes protected-folder failures: %s', (message) => {
    expect(isWorkspacePermissionError(new Error(message))).toBe(true);
  });

  it('does not hide unrelated workspace failures', () => {
    expect(isWorkspacePermissionError(new Error('No conversation found'))).toBe(false);
  });
});
