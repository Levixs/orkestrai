import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { roleService } from '$lib/modules/agent-room/application/services/RoleService.js';
import { taskBoardService } from '$lib/modules/agent-room/application/services/TaskBoardService.js';
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
    expect(result).toEqual({ applied: true, tasksDelivered: 0 });

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
    expect(await roleService.applyToTerminal(workspace.id, terminal.id)).toEqual({ applied: false, tasksDelivered: 0 });

    const withRole = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Agente 2',
      payload: { command: '/bin/cat', role: 'Revisor' },
    });
    await roleService.save(workspace.id, { name: 'Revisor', prompt: 'x' });
    await expect(roleService.applyToTerminal(workspace.id, withRole.id)).rejects.toThrow('sessão');
  });

  it('entrega ao maestro todos os dados das tarefas iniciais sem responsavel', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'fila inicial', workingDir: '/tmp' });
    const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    const leader = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Lider',
      payload: { command: '/bin/cat', sessionId: session.id, maestro: true },
    });
    const task = await taskBoardService.create(workspace.id, {
      title: 'Revisar onboarding',
      description: 'Validar idioma, acessibilidade e as capturas anexadas.',
      createdBy: 'preset',
    });

    const result = await roleService.applyToTerminal(workspace.id, leader.id);
    expect(result).toEqual({ applied: false, tasksDelivered: 1 });

    await new Promise((resolve) => setTimeout(resolve, 600));
    const { scrollback, detach } = ptySessionManager.attach(session.id, () => {});
    detach();
    expect(scrollback).toContain(task.id.slice(0, 8));
    expect(scrollback).toContain('Revisar onboarding');
    expect(scrollback).toContain('Validar idioma, acessibilidade e as capturas anexadas.');
    expect(scrollback).toContain('orkestrai task assign');
    ptySessionManager.kill(session.id);
  });
});
