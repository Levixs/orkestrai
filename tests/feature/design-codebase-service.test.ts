import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { designCodebaseService } from '$lib/modules/agent-room/application/services/DesignCodebaseService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

const directories: string[] = [];

describe('DesignCodebaseService', () => {
  useSvelarTest({ refreshDatabase: true });

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('scans supported sources without executing project configuration', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orkestrai-design-code-'));
    directories.push(directory);
    const sentinel = join(directory, 'executed.txt');
    writeFileSync(join(directory, 'app.css'), ':root { --color-brand: #2244aa; }');
    writeFileSync(join(directory, 'Button.svelte'), '<script>export let label;</script><button>{label}</button>');
    writeFileSync(join(directory, 'tailwind.config.js'), `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'unsafe'); export default { theme: { extend: { spacing: { panel: '32px' } } } };`);
    const workspace = await workspaceRepository.createWorkspace({ name: 'Code scan', workingDir: directory });

    const result = await designCodebaseService.scan(workspace.id);

    expect(result.tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'color/brand', type: 'color' }),
      expect.objectContaining({ name: 'space/panel', value: 32 }),
    ]));
    expect(result.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Button', framework: 'svelte', props: ['label'] }),
    ]));
    expect(existsSync(sentinel)).toBe(false);
  });

  it('returns an empty scan for a workspace without design-system sources', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orkestrai-design-code-empty-'));
    directories.push(directory);
    writeFileSync(join(directory, 'README.md'), '# Empty');
    const workspace = await workspaceRepository.createWorkspace({ name: 'Empty scan', workingDir: directory });

    await expect(designCodebaseService.scan(workspace.id)).resolves.toMatchObject({ files: [], tokens: [], components: [], truncated: false });
  });
});
