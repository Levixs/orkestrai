import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { filesystemService } from '$lib/modules/agent-room/application/services/FilesystemService.js';
import { gitService } from '$lib/modules/agent-room/application/services/GitService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

function makeGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'orkestrai-git-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'teste@orkestrai.local'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Teste'], { cwd: dir });
  writeFileSync(join(dir, 'README.md'), '# repo\n');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'index.ts'), 'export const a = 1;\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'inicial'], { cwd: dir });
  return dir;
}

describe('FilesystemService + GitService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('lista diretorio confinado ao workspace e bloqueia fuga de path', async () => {
    const dir = makeGitRepo();
    const workspace = await workspaceRepository.createWorkspace({ name: 'fs', workingDir: dir });

    const entries = await filesystemService.list(workspace.id);
    expect(entries.map((entry) => entry.name)).toContain('README.md');
    expect(entries.find((entry) => entry.name === 'src')?.type).toBe('directory');
    expect(entries.some((entry) => entry.name === '.git')).toBe(false);

    await expect(filesystemService.list(workspace.id, '../../etc')).rejects.toThrow('fora do diretorio');
    await expect(filesystemService.read(workspace.id, '/etc/passwd')).rejects.toThrow('fora do diretorio');
  });

  it('le e escreve arquivos dentro do workspace', async () => {
    const dir = makeGitRepo();
    const workspace = await workspaceRepository.createWorkspace({ name: 'fs', workingDir: dir });

    const read = await filesystemService.read(workspace.id, 'src/index.ts');
    expect(read.content).toContain('export const a = 1');

    await filesystemService.write(workspace.id, 'src/index.ts', 'export const a = 2;\n');
    expect((await filesystemService.read(workspace.id, 'src/index.ts')).content).toContain('a = 2');
  });

  it('status, diff, stage, unstage e discard', async () => {
    const dir = makeGitRepo();
    const workspace = await workspaceRepository.createWorkspace({ name: 'fs', workingDir: dir });

    writeFileSync(join(dir, 'README.md'), '# repo alterado\n');

    const status = await gitService.status(workspace.id);
    expect(status.isRepo).toBe(true);
    expect(status.branch).toBe('main');
    expect(status.changes).toEqual([{ path: 'README.md', status: 'M', staged: false }]);

    const diff = await gitService.diff(workspace.id, 'README.md');
    expect(diff.diff).toContain('repo alterado');

    await gitService.stage(workspace.id, 'README.md');
    const staged = await gitService.status(workspace.id);
    expect(staged.changes[0].staged).toBe(true);

    await gitService.unstage(workspace.id, 'README.md');
    await gitService.discard(workspace.id, 'README.md');
    const clean = await gitService.status(workspace.id);
    expect(clean.changes).toHaveLength(0);
  });

  it('status em diretorio sem repo retorna isRepo false', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-nogit-'));
    const workspace = await workspaceRepository.createWorkspace({ name: 'fs', workingDir: dir });
    const status = await gitService.status(workspace.id);
    expect(status.isRepo).toBe(false);
    expect(status.changes).toEqual([]);
  });
});
