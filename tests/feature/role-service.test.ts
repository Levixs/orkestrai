import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { roleService } from '$lib/modules/agent-room/application/services/RoleService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';

describe('RoleService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('aplica a role submetendo texto e Enter em writes separados (composer do Codex)', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'roles', workingDir: '/tmp' });
    const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    const terminal = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Agente',
      payload: { command: '/bin/cat', sessionId: session.id, role: 'Revisor' },
    });
    await roleService.save(workspace.id, { name: 'Revisor', prompt: 'so aponte problemas, nao edite codigo' });

    const result = await roleService.applyToTerminal(workspace.id, terminal.id);
    expect(result.applied).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 600));
    const { scrollback, detach } = ptySessionManager.attach(session.id, () => {});
    detach();
    expect(scrollback).toContain('[responsabilidade: Revisor] so aponte problemas');
    ptySessionManager.kill(session.id);
  });

  it('sem role atribuida nao aplica; sem sessao falha', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'roles2', workingDir: '/tmp' });
    const terminal = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Agente',
      payload: { command: '/bin/cat' },
    });
    expect(await roleService.applyToTerminal(workspace.id, terminal.id)).toEqual({ applied: false });

    const withRole = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Agente 2',
      payload: { command: '/bin/cat', role: 'Revisor' },
    });
    await roleService.save(workspace.id, { name: 'Revisor', prompt: 'x' });
    await expect(roleService.applyToTerminal(workspace.id, withRole.id)).rejects.toThrow('sessao');
  });
});
