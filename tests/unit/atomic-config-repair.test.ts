import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repairConfigFileAtomically } from '$lib/modules/agent-room/infrastructure/atomic-config-repair.js';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('atomic config repair', () => {
  it('creates one backup and serializes concurrent repairs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orkestrai-config-'));
    dirs.push(dir);
    const path = join(dir, 'config.toml');
    await writeFile(path, 'broken\n', { mode: 0o600 });
    const repair = (current: string) => current === 'broken\n'
      ? { content: 'fixed\n', repaired: true }
      : { content: current, repaired: false };

    const results = await Promise.all([
      repairConfigFileAtomically(path, repair),
      repairConfigFileAtomically(path, repair),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await readFile(path, 'utf8')).toBe('fixed\n');
    expect(await readFile(`${path}.before-orkestrai-repair`, 'utf8')).toBe('broken\n');
  });
});
