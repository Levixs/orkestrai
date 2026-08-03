import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { floorService } from '$lib/modules/agent-room/application/services/FloorService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'orkestrai-floor-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'teste@orkestrai.local'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Teste'], { cwd: dir });
  writeFileSync(join(dir, 'app.ts'), 'const v = 1;\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'inicial'], { cwd: dir });
  return dir;
}

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

describe('FloorService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('cria andar com worktree e branch, lista e renomeia', async () => {
    const dir = makeRepo();
    const workspace = await workspaceRepository.createWorkspace({ name: 'ws', workingDir: dir });

    const floor = await floorService.create(workspace.id, { name: 'Fix login' });
    expect(floor.branch).toBe('orkestrai/fix-login');
    expect(git(dir, ['worktree', 'list'])).toContain('fix-login');
    expect(git(floor.path, ['branch', '--show-current']).trim()).toBe('orkestrai/fix-login');

    expect(await floorService.list(workspace.id)).toHaveLength(1);

    const renamed = await floorService.rename(floor.id, 'Fix login 2');
    expect(renamed.name).toBe('Fix login 2');

    await floorService.remove(floor.id, true);
    expect(await floorService.list(workspace.id)).toHaveLength(0);
    expect(git(dir, ['branch', '--list', 'orkestrai/*'])).not.toContain('fix-login');
  });

  it('clona layout do terreo quando pedido', async () => {
    const dir = makeRepo();
    const workspace = await workspaceRepository.createWorkspace({ name: 'ws', workingDir: dir });
    await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'note', title: 'Nota terreo' });

    const floor = await floorService.create(workspace.id, { name: 'andar', cloneLayout: true });
    const floorNodes = await workspaceRepository.listNodes(workspace.id, floor.id);
    expect(floorNodes).toHaveLength(1);
    expect(floorNodes[0].title).toBe('Nota terreo');
    expect(floorNodes[0].floorId).toBe(floor.id);

    await floorService.remove(floor.id, true);
  });

  it('aterrissa mudancas do andar na branch principal', async () => {
    const dir = makeRepo();
    const workspace = await workspaceRepository.createWorkspace({ name: 'ws', workingDir: dir });
    const floor = await floorService.create(workspace.id, { name: 'feature' });

    writeFileSync(join(floor.path, 'app.ts'), 'const v = 2;\n');
    git(floor.path, ['add', '.']);
    git(floor.path, ['commit', '-m', 'muda v']);

    const preview = await floorService.landingPreview(floor.id);
    expect(preview.to).toBe('main');
    expect(preview.stat).toContain('app.ts');

    const landed = await floorService.land(floor.id);
    expect(landed.merged).toBe(true);
    expect(git(dir, ['log', '-1', '--format=%s'])).toContain('Merge');
    expect((await import('node:fs')).readFileSync(join(dir, 'app.ts'), 'utf8')).toContain('v = 2');
  });

  it('recusa aterrissagem com checkout sujo', async () => {
    const dir = makeRepo();
    const workspace = await workspaceRepository.createWorkspace({ name: 'ws', workingDir: dir });
    const floor = await floorService.create(workspace.id, { name: 'feature' });
    writeFileSync(join(floor.path, 'app.ts'), 'const v = 2;\n');
    git(floor.path, ['add', '.']);
    git(floor.path, ['commit', '-m', 'muda v']);

    writeFileSync(join(dir, 'app.ts'), 'const v = 99;\n');
    await expect(floorService.land(floor.id)).rejects.toThrow('nao commitadas');
    await floorService.remove(floor.id, true);
  });

  it('hooks recebem variaveis ORKESTRAI_*', async () => {
    const dir = makeRepo();
    const workspace = await workspaceRepository.createWorkspace({ name: 'MeuProj', workingDir: dir });
    const floor = await floorService.create(workspace.id, { name: 'hooked' });

    const results = await floorService.runHooks(floor, workspace, [
      { command: 'echo "$ORKESTRAI_FLOOR_NAME|$ORKESTRAI_PROJECT_NAME|$ORKESTRAI_BRANCH_NAME"' },
    ]);
    expect(results[0].ok).toBe(true);
    expect(results[0].output).toBe('hooked|MeuProj|orkestrai/hooked');

    await floorService.remove(floor.id, true);
  });

  it('salva e recupera hooks do workspace', async () => {
    const dir = makeRepo();
    const workspace = await workspaceRepository.createWorkspace({ name: 'ws', workingDir: dir });
    await floorService.saveHooks(workspace.id, {
      setup: [{ command: 'npm install' }],
      autoRunSetup: true,
      teardown: [{ command: 'echo fim' }],
    });
    const hooks = await floorService.hooksFor(workspace.id);
    expect(hooks.setup).toHaveLength(1);
    expect(hooks.autoRunSetup).toBe(true);
    expect(hooks.teardown).toHaveLength(1);
  });
});
