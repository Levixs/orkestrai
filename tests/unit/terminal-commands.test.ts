import { describe, expect, it } from 'vitest';
import {
  normalizeSavedTerminalCommands,
  resumeTerminalCommandInput,
  savedTerminalCommandInput,
  terminalCommandFingerprint,
  type SavedTerminalCommand,
} from '../../src/lib/modules/agent-room/domain/terminal-commands.js';

const commands: SavedTerminalCommand[] = [
  { id: 'one', name: 'Install', command: 'npm install', runOnResume: true },
  { id: 'two', name: 'Develop', command: 'npm run dev', runOnResume: true },
];

describe('terminal saved commands', () => {
  it('normalizes persisted JSON and ignores invalid or duplicate entries', () => {
    expect(normalizeSavedTerminalCommands(JSON.stringify([
      commands[0],
      { ...commands[0], name: 'Duplicate' },
      { id: '', name: 'Invalid', command: 'echo no' },
      commands[1],
    ]))).toEqual(commands);
    expect(normalizeSavedTerminalCommands('{broken')).toEqual([]);
  });

  it('converts multiline input to terminal Enter sequences', () => {
    expect(savedTerminalCommandInput('printf one\nprintf two\n')).toBe('printf one\rprintf two\r');
  });

  it('chains resume commands for POSIX and PowerShell shells', () => {
    expect(resumeTerminalCommandInput(commands, '/bin/zsh')).toBe('npm install && npm run dev\r');
    expect(resumeTerminalCommandInput(commands, 'powershell.exe')).toBe('npm install; npm run dev\r');
  });

  it('runs the same resume command only once across terminal and global scopes', () => {
    expect(resumeTerminalCommandInput([...commands, { ...commands[0], id: 'global-install' }], '/bin/zsh'))
      .toBe('npm install && npm run dev\r');
  });

  it('uses a stable content fingerprint for one auto-run per renderer boot', () => {
    expect(terminalCommandFingerprint('ls\r')).toBe(terminalCommandFingerprint('ls\r'));
    expect(terminalCommandFingerprint('pwd\r')).not.toBe(terminalCommandFingerprint('ls\r'));
  });
});
