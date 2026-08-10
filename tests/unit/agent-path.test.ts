import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fallbackCliLauncher } from '$lib/modules/agent-room/infrastructure/agent-path.js';

const temporaryDirs: string[] = [];

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('fallbackCliLauncher', () => {
  it('usa o launcher .cmd no Windows e nunca o JavaScript cru', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-launcher-'));
    temporaryDirs.push(dir);
    const launcher = join(dir, 'orkestrai.cmd');
    writeFileSync(launcher, '@echo off\r\n');

    expect(fallbackCliLauncher('win32', { ORKESTRAI_SHIM_DIR: dir }, 'C:\\app\\orkestrai.js')).toBe(launcher);
    expect(fallbackCliLauncher('win32', {}, 'C:\\app\\orkestrai.js')).toBeUndefined();
  });

  it('mantem o fallback por shebang no POSIX', () => {
    expect(fallbackCliLauncher('darwin', {}, '/app/orkestrai.js')).toBe('/app/orkestrai.js');
  });
});
