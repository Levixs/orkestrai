import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { roleService } from '$lib/modules/agent-room/application/services/RoleService.js';
import { taskBoardService } from '$lib/modules/agent-room/application/services/TaskBoardService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';

describe('RoleService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('aplica em providers sem suporte nativo apenas uma referencia curta ao arquivo da role', async () => {
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
    expect(scrollback).toContain('[responsabilidade: Revisor] Leia e siga .orkestrai/roles/revisor/AGENTS.md');
    expect(scrollback).not.toContain('so aponte problemas, nao edite codigo');
    ptySessionManager.kill(session.id);
  });

  it('nao cola a role quando ela ja foi configurada nativamente no launch', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'role nativa', workingDir: '/tmp' });
    const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    const terminal = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Agente',
      payload: {
        command: '/bin/cat',
        sessionId: session.id,
        role: 'Revisor',
        roleConfiguredAtLaunch: 'Revisor',
      },
    });
    await roleService.save(workspace.id, { name: 'Revisor', prompt: 'prompt longo que nao pode ir ao composer' });

    expect(await roleService.applyToTerminal(workspace.id, terminal.id, 'fresh'))
      .toEqual({ applied: false, tasksDelivered: 0 });

    await new Promise((resolve) => setTimeout(resolve, 100));
    const { scrollback, detach } = ptySessionManager.attach(session.id, () => {});
    detach();
    expect(scrollback).not.toContain('prompt longo');
    expect(scrollback).not.toContain('[responsabilidade: Revisor]');
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

  it('na retomada nao repete a role e acorda apenas o agente com tarefa aberta', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'retomada seletiva', workingDir: '/tmp' });
    const agent = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Implementador',
      payload: { command: '/bin/cat', role: 'Revisor' },
    });
    await roleService.save(workspace.id, { name: 'Revisor', prompt: 'revise tudo com cuidado' });
    const openTask = await taskBoardService.create(workspace.id, {
      title: 'Concluir integração',
      description: 'Retomar do teste que ficou pela metade.',
      assigneeNodeId: agent.id,
      createdBy: 'preset',
    });
    const doneTask = await taskBoardService.create(workspace.id, {
      title: 'Não repetir trabalho pronto',
      assigneeNodeId: agent.id,
      createdBy: 'preset',
    });
    await taskBoardService.update(workspace.id, doneTask.id, { status: 'done' });
    const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    await workspaceRepository.updateNode(agent.id, {
      payload: { command: '/bin/cat', sessionId: session.id, role: 'Revisor' },
    });

    const result = await roleService.applyToTerminal(workspace.id, agent.id, 'resume');
    expect(result).toEqual({ applied: false, tasksDelivered: 1 });

    await new Promise((resolve) => setTimeout(resolve, 600));
    const { scrollback, detach } = ptySessionManager.attach(session.id, () => {});
    detach();
    expect(scrollback).toContain('[retomada do workspace]');
    expect(scrollback).toContain(openTask.id.slice(0, 8));
    expect(scrollback).toContain('Retomar do teste que ficou pela metade.');
    expect(scrollback).not.toContain('[responsabilidade: Revisor]');
    expect(scrollback).not.toContain(doneTask.title);
    ptySessionManager.kill(session.id);
  });

  it('na retomada deixa terminal sem trabalho em silencio', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'retomada ociosa', workingDir: '/tmp' });
    const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    const agent = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Sem fila',
      payload: { command: '/bin/cat', sessionId: session.id, role: 'Revisor' },
    });
    await roleService.save(workspace.id, { name: 'Revisor', prompt: 'isso nao deve ser repetido' });

    expect(await roleService.applyToTerminal(workspace.id, agent.id, 'resume'))
      .toEqual({ applied: false, tasksDelivered: 0 });

    await new Promise((resolve) => setTimeout(resolve, 100));
    const { scrollback, detach } = ptySessionManager.attach(session.id, () => {});
    detach();
    expect(scrollback).not.toContain('isso nao deve ser repetido');
    expect(scrollback).not.toContain('[retomada do workspace]');
    ptySessionManager.kill(session.id);
  });

  it('ao trocar a role aplica apenas a nova responsabilidade, sem repetir a fila', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'troca de role', workingDir: '/tmp' });
    const session = ptySessionManager.create({ command: '/bin/cat', cwd: '/tmp' });
    const leader = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Lider',
      payload: { command: '/bin/cat', sessionId: session.id, role: 'Lider técnico', maestro: true },
    });
    await roleService.save(workspace.id, { name: 'Lider técnico', prompt: 'coordene o time' });
    await taskBoardService.create(workspace.id, { title: 'Fila já existente', createdBy: 'preset' });

    expect(await roleService.applyToTerminal(workspace.id, leader.id, 'role'))
      .toEqual({ applied: true, tasksDelivered: 0 });

    await new Promise((resolve) => setTimeout(resolve, 600));
    const { scrollback, detach } = ptySessionManager.attach(session.id, () => {});
    detach();
    expect(scrollback).toContain('[responsabilidade: Lider técnico] Leia e siga .orkestrai/roles/lider-tecnico/AGENTS.md');
    expect(scrollback).not.toContain('coordene o time');
    expect(scrollback).not.toContain('Fila já existente');
    ptySessionManager.kill(session.id);
  });
});
