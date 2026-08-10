import { describe, expect, it } from 'vitest';
import { terminalDictationInput } from '$lib/components/agent-room/terminal-dictation.js';

describe('terminalDictationInput', () => {
  it('preserves the current insert-only behavior by default', () => {
    expect(terminalDictationInput('review the release', false)).toBe('review the release');
  });

  it('submits terminal dictation with the PTY enter character when enabled', () => {
    expect(terminalDictationInput('review the release', true)).toBe('review the release\r');
  });
});
