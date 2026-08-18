import { describe, expect, it } from 'vitest';
import { workingDirectoryFromOsc } from '$lib/components/agent-room/terminal-working-directory.js';
import { parseLsofWorkingDirectory } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';

describe('terminal working directory', () => {
  it('decodes the standard OSC 7 file URI', () => {
    expect(workingDirectoryFromOsc('file://MacBook/Users/raoni/My%20Project')).toBe('/Users/raoni/My Project');
    expect(workingDirectoryFromOsc('https://example.com/nope')).toBeNull();
  });

  it('normalizes Windows drive paths reported by OSC 7', () => {
    expect(workingDirectoryFromOsc('file://desktop/C:/Users/Raoni/App', true)).toBe('C:/Users/Raoni/App');
  });

  it('extracts cwd from lsof field output', () => {
    expect(parseLsofWorkingDirectory('p120\nfcwd\nn/Users/raoni/project\n')).toBe('/Users/raoni/project');
    expect(parseLsofWorkingDirectory('')).toBeNull();
  });
});
