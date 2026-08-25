import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { WorkspaceGroupError, workspaceGroupService } from '$lib/modules/agent-room/application/services/WorkspaceGroupService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

async function makeWorkspace(name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'orkestrai-workspace-group-'));
  return workspaceRepository.createWorkspace({ name, workingDir: dir });
}

describe('WorkspaceGroupService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('cria, lista em ordem estavel e rejeita nome vazio', async () => {
    const a = await workspaceGroupService.create({ name: 'Cliente A' });
    const b = await workspaceGroupService.create({ name: 'Cliente B' });
    expect(await workspaceGroupService.list()).toMatchObject([
      { id: a.id, position: 0, parentId: null },
      { id: b.id, position: 1, parentId: null },
    ]);
    await expect(workspaceGroupService.create({ name: '   ' })).rejects.toMatchObject({ code: 'group_name_required' });
  });

  it('aninha subpastas e rejeita pai inexistente', async () => {
    const parent = await workspaceGroupService.create({ name: 'Cliente A' });
    const child = await workspaceGroupService.create({ name: 'Projeto X', parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
    await expect(workspaceGroupService.create({ name: 'orfa', parentId: 'nao-existe' })).rejects.toMatchObject({ code: 'group_not_found' });
  });

  it('rejeita mover uma pasta para dentro dela mesma ou de uma subpasta sua (ciclo)', async () => {
    const root = await workspaceGroupService.create({ name: 'Raiz' });
    const child = await workspaceGroupService.create({ name: 'Filha', parentId: root.id });
    const grandchild = await workspaceGroupService.create({ name: 'Neta', parentId: child.id });

    await expect(workspaceGroupService.update(root.id, { parentId: root.id })).rejects.toMatchObject({ code: 'group_cycle' });
    await expect(workspaceGroupService.update(root.id, { parentId: grandchild.id })).rejects.toMatchObject({ code: 'group_cycle' });

    // Mover a neta para a raiz (parentId: null) continua permitido.
    const moved = await workspaceGroupService.update(grandchild.id, { parentId: null });
    expect(moved.parentId).toBeNull();
  });

  it('exclusao nao e destrutiva: workspaces e subpastas sobem para a raiz', async () => {
    const parent = await workspaceGroupService.create({ name: 'Cliente A' });
    const child = await workspaceGroupService.create({ name: 'Projeto X', parentId: parent.id });
    const workspace = await makeWorkspace('app-cliente-a');
    await workspaceGroupService.moveWorkspace(workspace.id, parent.id);

    await workspaceGroupService.remove(parent.id);

    const groups = await workspaceGroupService.list();
    expect(groups.find((group) => group.id === child.id)?.parentId).toBeNull();
    const moved = await workspaceRepository.getWorkspace(workspace.id);
    expect(moved?.groupId).toBeNull();
  });

  it('move workspace entre pastas e para a raiz, acumulando posicao no fim', async () => {
    const group = await workspaceGroupService.create({ name: 'Cliente A' });
    const first = await makeWorkspace('app-1');
    const second = await makeWorkspace('app-2');

    await workspaceGroupService.moveWorkspace(first.id, group.id);
    await workspaceGroupService.moveWorkspace(second.id, group.id);
    expect((await workspaceRepository.getWorkspace(first.id))?.position).toBe(0);
    expect((await workspaceRepository.getWorkspace(second.id))?.position).toBe(1);

    await workspaceGroupService.moveWorkspace(first.id, null);
    expect((await workspaceRepository.getWorkspace(first.id))?.groupId).toBeNull();

    await expect(workspaceGroupService.moveWorkspace('nao-existe', group.id)).rejects.toBeInstanceOf(WorkspaceGroupError);
  });
});
